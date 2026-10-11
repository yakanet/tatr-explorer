/**
 * The dev server's half of the served source: it reads a folder from the disk,
 * answers the page over HTTP, writes task files back and pushes changes.
 *
 * A Vite plugin rather than SvelteKit routes, so the routes exist in the dev
 * server only and the static build never includes them. They run after Vite's
 * own handlers, its CORS and host checks included, so a foreign origin cannot
 * read them and a rebound DNS name cannot reach them. Pushes go over Vite's dev
 * channel, which a page joins with a token a foreign page cannot read.
 *
 * `.server.ts`, so SvelteKit refuses to let browser code import it: the page
 * half is `source.ts`, and the two share only `protocol.ts`.
 */
import { watch } from 'node:fs';
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { arrayBuffer } from 'node:stream/consumers';
import { TLSSocket } from 'node:tls';
import type { Connect, Plugin } from 'vite';
import { branchFromHead } from '../local/folder.ts';
import { settle } from '../settle.ts';
import type { Listing } from '../contract.ts';
import { CHANGED, ROUTES, tagOf } from './protocol.ts';

/** A folder found on the disk, and where its task folders are. */
export interface ServedFolder {
	/** The folder, with symbolic links resolved. */
	root: string;
	/** Its `tasks/`, or the folder itself when it is one; null when neither. */
	tasks: string | null;
}

/**
 * Finds `folder` and its tasks by the rule `tasksDirectoryOf` follows in the
 * browser. A folder that is neither a repository nor a tasks folder is served
 * empty.
 */
export async function locate(folder: string): Promise<ServedFolder> {
	const root = await realpath(path.resolve(folder));
	const inside = path.join(root, 'tasks');
	// Resolved here, so `diskPath` compares every path with the real location.
	if (await isDirectory(inside)) return { root, tasks: await realpath(inside) };
	if (await holdsTaskFolders(root)) return { root, tasks: root };
	return { root, tasks: null };
}

/**
 * Lists every regular file under the tasks as `tasks/...`, with the branch
 * `.git/HEAD` names. Symbolic links are left out, as they could point outside
 * the folder.
 */
export async function listing(served: ServedFolder): Promise<Listing> {
	const branch = (await branchOf(served)) ?? 'working tree';
	const tasks = served.tasks;
	if (!tasks) return { entries: [], branch };
	const found = await readdir(tasks, { recursive: true, withFileTypes: true });
	const entries = await Promise.all(
		found
			.filter((entry) => entry.isFile())
			.map(async (entry) => {
				const disk = path.join(entry.parentPath, entry.name);
				const relative = path.relative(tasks, disk).split(path.sep).join('/');
				return { path: `tasks/${relative}`, size: (await stat(disk)).size };
			})
	);
	// `readdir` promises no order, and the same folder should list the same way twice.
	entries.sort((a, b) => a.path.localeCompare(b.path));
	return { entries, branch };
}

/**
 * The file on disk a page path names, or null for one the page may not read:
 * anything that resolves outside `tasks/`, by `..` or by a symbolic link, even
 * to elsewhere in the same folder.
 */
export async function diskPath(served: ServedFolder, page: string): Promise<string | null> {
	if (!served.tasks || !page.startsWith('tasks/')) return null;
	try {
		const real = await realpath(path.resolve(served.tasks, page.slice('tasks/'.length)));
		if (!isInside(served.tasks, real)) return null;
		if (!(await stat(real)).isFile()) return null;
		return real;
	} catch {
		return null;
	}
}

/**
 * Answers a request for the folder, or returns null to leave it to Vite and
 * SvelteKit. `/` redirects to `/served`, so the dev server opens on the folder;
 * the dev server is always at the root, as the base path applies to the build.
 */
export async function answer(served: ServedFolder, request: Request): Promise<Response | null> {
	const { pathname, origin } = new URL(request.url);
	if (pathname === '/' && request.method === 'GET') {
		return new Response(null, { status: 302, headers: { location: '/served' } });
	}

	if (!pathname.startsWith(PREFIX)) return null;
	// Vite's CORS admits a page from any port of this machine, so only a request
	// whose `Origin` is this server's may write. The browser sets `Origin` on
	// every such request, and a page cannot forge it.
	if (request.method !== 'GET' && request.headers.get('origin') !== origin) {
		return new Response(null, { status: 403 });
	}
	const route = pathname.slice(PREFIX.length);

	if (route === 'listing') {
		if (request.method !== 'GET') return notAllowed('GET');
		return Response.json(await listing(served), { headers: NO_STORE });
	}
	if (route.startsWith('files/')) {
		// A task file is replaced whole; nothing is created or removed.
		if (request.method !== 'GET' && request.method !== 'PUT') return notAllowed('GET, PUT');
		const page = decoded(route.slice('files/'.length));
		if (page === null) return new Response(null, { status: 400 });
		const disk = await diskPath(served, page);
		if (!disk) return new Response(null, { status: 404 });
		if (request.method === 'PUT') return write(disk, request);
		return file(disk);
	}
	return new Response(null, { status: 404 });
}

/** The path prefix of the folder's routes. */
const PREFIX = `/${ROUTES}/`;

function notAllowed(allow: string): Response {
	return new Response(null, { status: 405, headers: { allow } });
}

/**
 * The Vite plugin: `TATR_FOLDER=../my-project pnpm run dev` serves that folder
 * and opens on it. Without the variable, or in a build, it installs nothing and
 * defines `__TATR_SERVED__` as false, which drops the page half from the bundle.
 */
export function tatrServedFolder(folder = process.env.TATR_FOLDER): Plugin {
	return {
		name: 'tatr-served-folder',

		config: (_config, { command }) => ({
			define: { __TATR_SERVED__: JSON.stringify(servedName(folder, command)) }
		}),

		configureServer: {
			// Before SvelteKit's, whatever the plugin order, so these routes come
			// ahead of its catch-all.
			order: 'pre',
			async handler(server) {
				if (!folder) return;
				const served = await locate(folder);

				const stop = watchFolder(served, () => server.ws.send(CHANGED));
				server.httpServer?.once('close', stop);

				// Printed with Vite's URLs, so the address shown is the one it listens on.
				const printUrls = server.printUrls;
				server.printUrls = () => {
					printUrls();
					const url = server.resolvedUrls?.local[0];
					if (url) server.config.logger.info(`  ➜  tatr:    ${served.root} at ${url}served`);
				};

				// Returned, so Vite installs it after its own handlers: module requests
				// never reach it, and no Vite route is shadowed.
				return () => server.middlewares.use(serve(served));
			}
		}
	};
}

/**
 * The routes as a Connect middleware, which passes on any request `answer`
 * leaves. Exported for its spec, which runs it on a real server.
 */
export function serve(served: ServedFolder): Connect.NextHandleFunction {
	return (req, res, next) => {
		requestOf(req)
			.then((request) => answer(served, request))
			.then(async (reply) => {
				if (!reply) return next();
				res.writeHead(reply.status, Object.fromEntries(reply.headers));
				res.end(Buffer.from(await reply.arrayBuffer()));
			})
			.catch(next);
	};
}

/**
 * Converts Node's request into a web `Request` at the address the browser used:
 * its host passed Vite's host check, so it is the origin a write must name. The
 * body is read only for a write to the routes, so a request passed on reaches
 * the next handler unread.
 */
async function requestOf(req: Connect.IncomingMessage): Promise<Request> {
	const url = new URL(req.url ?? '/', `${schemeOf(req)}://${req.headers.host ?? 'localhost'}`);
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (typeof value === 'string') headers.set(name, value);
	}
	return new Request(url, { method: req.method, headers, body: await bodyOf(req, url) });
}

function schemeOf(req: Connect.IncomingMessage): string {
	if (req.socket instanceof TLSSocket) return 'https';
	return 'http';
}

async function bodyOf(req: Connect.IncomingMessage, url: URL): Promise<ArrayBuffer | undefined> {
	if (req.method !== 'PUT' || !url.pathname.startsWith(PREFIX)) return undefined;
	return arrayBuffer(req);
}

/** The name the page shows, for a dev server serving a folder; false otherwise. */
function servedName(folder: string | undefined, command: 'serve' | 'build'): string | false {
	if (command !== 'serve' || !folder) return false;
	return path.basename(path.resolve(folder));
}

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Calls `onChange` on any change under the tasks, swap files included, as
 * reading again is cheap. It has a watch of its own: Vite's ignores this
 * repository's `tasks/`, and never sees a folder outside its root.
 */
function watchFolder(served: ServedFolder, onChange: () => void): () => void {
	if (!served.tasks) return () => {};
	const burst = settle(onChange);
	const watcher = watch(served.tasks, { recursive: true }, burst.trigger);
	return () => {
		burst.cancel();
		watcher.close();
	};
}

/**
 * Serves one file raw, sandboxed: an SVG or HTML attachment opened in its own
 * tab would otherwise run scripts as the dev server's origin, the one origin
 * its routes let write.
 */
async function file(disk: string): Promise<Response> {
	return new Response(await readFile(disk), {
		headers: {
			...NO_STORE,
			'content-type': typeOf(disk),
			'content-security-policy': 'sandbox',
			'x-content-type-options': 'nosniff'
		}
	});
}

/** Replaces one file whole: 412 when `If-Match` does not hold, 428 when it is missing. */
async function write(disk: string, request: Request): Promise<Response> {
	const expected = request.headers.get('if-match');
	if (!expected) return new Response(null, { status: 428 });
	if (expected !== (await tagOf(new TextDecoder().decode(await readFile(disk))))) {
		return new Response(null, { status: 412 });
	}
	await writeFile(disk, await request.bytes());
	return new Response(null, { status: 204 });
}

/** A path as the page encoded it, or null for one that does not decode. */
function decoded(encoded: string): string | null {
	try {
		return decodeURIComponent(encoded);
	} catch {
		return null;
	}
}

/** The branch the repository has checked out; a tasks folder served alone has none. */
async function branchOf(served: ServedFolder): Promise<string | undefined> {
	if (served.tasks === served.root) return undefined;
	try {
		return branchFromHead(await readFile(path.join(served.root, '.git', 'HEAD'), 'utf8'));
	} catch {
		return undefined;
	}
}

/** Whether `candidate` is strictly inside `directory`, the directory itself excluded. */
function isInside(directory: string, candidate: string): boolean {
	const relative = path.relative(directory, candidate);
	return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function isDirectory(candidate: string): Promise<boolean> {
	try {
		return (await stat(candidate)).isDirectory();
	} catch {
		return false;
	}
}

async function isFile(candidate: string): Promise<boolean> {
	try {
		return (await stat(candidate)).isFile();
	} catch {
		return false;
	}
}

/** Whether `root` holds a task folder, one with a `TASK.md`. */
async function holdsTaskFolders(root: string): Promise<boolean> {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (entry.isDirectory() && (await isFile(path.join(root, entry.name, 'TASK.md')))) return true;
	}
	return false;
}

const TYPES: Record<string, string> = {
	'.md': 'text/markdown; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml'
};

/** `tags` has no extension and is text; anything unknown is bytes. */
function typeOf(disk: string): string {
	const extension = path.extname(disk).toLowerCase();
	if (!extension) return 'text/plain; charset=utf-8';
	return TYPES[extension] ?? 'application/octet-stream';
}
