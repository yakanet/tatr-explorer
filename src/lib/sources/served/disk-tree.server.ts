/**
 * Writes a tree of files on the disk, for the specs: nothing in the application
 * imports this file. Its own file because both halves of the served source are
 * specced over real folders, as the disk is what they are about.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

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
