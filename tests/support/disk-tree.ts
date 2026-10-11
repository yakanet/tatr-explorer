/**
 * Writes a tree of files on the disk, and serves it as the dev server would:
 * the served source is specced over real folders, the disk being what it is
 * about, by its own specs and by the contract every source runs.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { answer, locate } from '#lib/sources/served/folder.server.ts';

/**
 * A fresh folder for every spec, removed after it. Returns a function, as the
 * folder only exists once the spec has started.
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

/** Where the page that asks is served from, which is where the dev server is. */
const PAGE = 'http://localhost:5173';

/**
 * A request as a page of the dev server makes it: at the server's address, and
 * naming the page's origin on anything but a read, as the browser does whatever
 * the page says. A spec may name another origin, to see it refused.
 */
export function fromPage(input: string, init: RequestInit = {}): Request {
	const headers = new Headers(init.headers);
	if (init.method && init.method !== 'GET' && !headers.has('origin')) {
		headers.set('origin', PAGE);
	}
	return new Request(new URL(input, PAGE), { ...init, headers });
}

/**
 * A fetch answered by the dev server's half itself, serving `folder`: no HTTP,
 * but no mock of either side. Called with a `this`, it refuses, as the
 * browser's own `fetch` does with any but the window.
 */
export async function serving(folder: string): Promise<typeof fetch> {
	const served = await locate(folder);
	return async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
		if (this !== undefined) throw new TypeError('Illegal invocation');
		const request = fromPage(String(input), init);
		return (await answer(served, request)) ?? new Response('not ours', { status: 404 });
	} as typeof fetch;
}
