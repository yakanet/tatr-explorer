/**
 * A folder handed over as the legacy entry tree, which a drop gives on Firefox
 * and Safari.
 */
import type { LocalFolder } from './folder.ts';

/**
 * Reads a folder through its entry tree. Like the handle walk, it asks for
 * `tasks/` and `.git/HEAD` by name.
 */
export async function fromDirectoryEntry(
	entry: FileSystemDirectoryEntry,
	signal?: AbortSignal
): Promise<LocalFolder> {
	const files = new Map<string, File>();

	async function walk(dir: FileSystemDirectoryEntry, prefix: string): Promise<void> {
		for (const found of await read(dir)) {
			signal?.throwIfAborted();
			const path = `${prefix}/${found.name}`;
			if (found.isDirectory) await walk(found as FileSystemDirectoryEntry, path);
			else {
				const file = await fileOf(found as FileSystemFileEntry);
				if (file) files.set(path, file);
			}
		}
	}

	const tasks = await tasksEntryOf(entry);
	if (tasks) await walk(tasks, 'tasks');

	// Only a repository root has a `.git` beside its tasks.
	if (tasks && tasks !== entry) {
		const git = await child<FileSystemDirectoryEntry>(entry, '.git', 'getDirectory');
		const head = git && (await child<FileSystemFileEntry>(git, 'HEAD', 'getFile'));
		const file = head && (await fileOf(head));
		if (file) files.set('.git/HEAD', file);
	}

	return { name: entry.name, files };
}

/**
 * Returns the entry holding the task folders: `tasks/` in a repository, the
 * folder itself when it is a tasks folder, or null for a folder that is
 * neither, which is then not walked.
 */
async function tasksEntryOf(
	entry: FileSystemDirectoryEntry
): Promise<FileSystemDirectoryEntry | null> {
	const inside = await child<FileSystemDirectoryEntry>(entry, 'tasks', 'getDirectory');
	if (inside) return inside;
	if (await holdsTaskFolders(entry)) return entry;
	return null;
}

/** Whether `dir` is itself a tasks folder, judged on its immediate children. */
async function holdsTaskFolders(dir: FileSystemDirectoryEntry): Promise<boolean> {
	for (const found of await read(dir)) {
		if (!found.isDirectory) continue;
		const task = found as FileSystemDirectoryEntry;
		if (await child<FileSystemFileEntry>(task, 'TASK.md', 'getFile')) return true;
	}
	return false;
}

/**
 * Lists every child of `dir`. `readEntries` answers a page at a time and ends
 * with an empty array, so it is called until then: one call silently drops all
 * but the first page. `Promise.withResolvers` keeps that recursion out of a
 * promise executor.
 */
function read(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
	const { promise, resolve, reject } = Promise.withResolvers<FileSystemEntry[]>();
	const reader = dir.createReader();
	const all: FileSystemEntry[] = [];

	const next = () => {
		reader.readEntries((batch) => {
			if (batch.length === 0) {
				return resolve(all);
			}
			all.push(...batch);
			next();
		}, reject);
	};

	next();
	return promise;
}

/** The child of `dir` called `name`, or null when it is absent or of the other kind. */
function child<T extends FileSystemEntry>(
	dir: FileSystemDirectoryEntry,
	name: string,
	kind: 'getDirectory' | 'getFile'
): Promise<T | null> {
	return new Promise<T | null>((resolve) => {
		dir[kind](
			name,
			{},
			(found) => resolve(found as T),
			() => resolve(null)
		);
	});
}

/** The file behind `found`, or null when the browser refuses to read it. */
function fileOf(found: FileSystemFileEntry): Promise<File | null> {
	return new Promise<File | null>((resolve) => found.file(resolve, () => resolve(null)));
}
