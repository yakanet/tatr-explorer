/**
 * Writes a tree of files on the disk, and serves it as the dev server would,
 * for the specs: nothing in the application imports this file. Its own file
 * because the served source is specced over real folders, as the disk is what
 * it is about, by its own specs and by the contract every source runs.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { answer, locate } from './folder.server.ts';

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

/**
 * A fetch answered by the dev server's half itself, serving `folder`: no HTTP,
 * but no mock of either side.
 */
export async function serving(folder: string): Promise<typeof fetch> {
	const served = await locate(folder);
	return (async (input: RequestInfo | URL) => {
		const request = new Request(new URL(String(input), 'http://localhost'));
		return (await answer(served, request)) ?? new Response('not ours', { status: 404 });
	}) as typeof fetch;
}
