/**
 * Writes trees of files to a scratch folder and serves them as the dev server
 * would, for the specs of the served source and of the source contract.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { answer, locate } from '#lib/sources/served/folder.server.ts';

/**
 * Creates a fresh folder before each spec and removes it after. Returns a
 * getter, as the folder exists only once a spec has started.
 */
export function scratchFolder(): () => string {
	let current = '';
	beforeEach(async () => {
		current = await mkdtemp(path.join(tmpdir(), 'tatr-served-'));
	});
	afterEach(async () => {
		await rm(current, { recursive: true, force: true });
	});
	return () => current;
}

/** Writes every file of `tree` under `root`, folders included, and returns `root`. */
export async function writeTree(root: string, tree: Record<string, string>): Promise<string> {
	for (const [file, contents] of Object.entries(tree)) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(path.join(root, file), contents);
	}
	return root;
}

/** The origin of the dev server and of its page. */
const PAGE = 'http://localhost:5173';

/**
 * A request as the dev server's page sends it, with the `Origin` the browser
 * adds to anything but a GET. A spec may set another origin to see it refused.
 */
export function fromPage(input: string, init: RequestInit = {}): Request {
	const headers = new Headers(init.headers);
	if (init.method && init.method !== 'GET' && !headers.has('origin')) {
		headers.set('origin', PAGE);
	}
	return new Request(new URL(input, PAGE), { ...init, headers });
}

/**
 * A `fetch` answered by the server half serving `folder`, without HTTP. Like the
 * browser's `fetch`, it throws when called with a `this`.
 */
export async function serving(folder: string): Promise<typeof fetch> {
	const served = await locate(folder);
	return async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
		if (this !== undefined) throw new TypeError('Illegal invocation');
		const request = fromPage(String(input), init);
		return (await answer(served, request)) ?? new Response('not ours', { status: 404 });
	} as typeof fetch;
}
