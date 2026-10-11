/**
 * A folder handed over as a directory handle, by `showDirectoryPicker()` or by a
 * drop on Chromium, which is the only way a folder can be written to.
 */
import type { LocalFolder } from './folder.ts';

/**
 * Reads a folder through a directory handle. Only `tasks/` is descended and
 * `.git/HEAD` is fetched by name, so the walk never enters `node_modules` or
 * the objects under `.git`.
 */
export async function fromDirectoryHandle(
	handle: FileSystemDirectoryHandle,
	signal?: AbortSignal
): Promise<LocalFolder> {
	const files = new Map<string, File>();

	async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
		for await (const [name, entry] of dir.entries()) {
			signal?.throwIfAborted();
			const path = `${prefix}/${name}`;
			if (entry.kind === 'directory') await walk(entry, path);
			else files.set(path, await entry.getFile());
		}
	}

	const tasks = await tasksDirectoryOf(handle);
	if (tasks) await walk(tasks, 'tasks');

	// Only a repository root has a `.git` beside its tasks.
	if (tasks && tasks !== handle) {
		const head = await fileOrNull(await directoryOrNull(handle, '.git'), 'HEAD');
		if (head) files.set('.git/HEAD', head);
	}

	return { name: handle.name, files };
}

/**
 * Returns the directory holding the task folders: `tasks/` in a repository, the
 * folder itself when it is a tasks folder, or null for a folder that is neither,
 * so that it is not walked and the loader reports no tasks folder. The walk and
 * the watch stay inside it, as the rest of a checkout is large and changes far
 * more often.
 */
export async function tasksDirectoryOf(
	handle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
	const inside = await directoryOrNull(handle, 'tasks');
	if (inside) return inside;
	if (await holdsTaskFolders(handle)) return handle;
	return null;
}

/**
 * Whether `dir` is itself a tasks folder, as `looksLikeTasksFolder` judges
 * paths. It checks the immediate children only and stops at the first
 * `TASK.md`, so a wrong pick costs one lookup per top-level entry.
 */
async function holdsTaskFolders(dir: FileSystemDirectoryHandle): Promise<boolean> {
	for await (const [, entry] of dir.entries()) {
		if (entry.kind !== 'directory') continue;
		if (await fileHandleOrNull(entry, 'TASK.md')) return true;
	}
	return false;
}

/**
 * Whether the browser can write through `handle`: only Chromium's can ask the
 * reader's permission to write, and it has `createWritable` with it.
 */
export function canWriteThrough(handle: FileSystemDirectoryHandle): boolean {
	return typeof handle.requestPermission === 'function';
}

/** Whether the reader allows writing through `handle`, asking only when it is not yet allowed. */
export async function askToWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
	const descriptor = { mode: 'readwrite' } as const;
	if ((await handle.queryPermission!(descriptor)) === 'granted') return true;
	return (await handle.requestPermission!(descriptor)) === 'granted';
}

/**
 * Replaces the file at `path` with `text` while it still holds `expected`, and
 * returns the file written, or null when it changed or went since. Throws
 * when the browser refuses the write.
 */
export async function writeThrough(
	handle: FileSystemDirectoryHandle,
	path: string,
	text: string,
	expected: string
): Promise<File | null> {
	const file = await fileHandleAt(handle, path);
	if (!file) return null;
	if ((await (await file.getFile()).text()) !== expected) return null;
	const stream = await file.createWritable();
	await stream.write(text);
	await stream.close();
	return file.getFile();
}

/**
 * The handle on the file at `path` from the repository root, or null when
 * there is none. Only a path under `tasks/` is looked up, as nothing else is
 * ever written.
 */
async function fileHandleAt(
	handle: FileSystemDirectoryHandle,
	path: string
): Promise<FileSystemFileHandle | null> {
	const [root, ...inside] = path.split('/');
	const name = inside.pop();
	if (root !== 'tasks' || !name) return null;
	let dir = await tasksDirectoryOf(handle);
	for (const segment of inside) dir = await directoryOrNull(dir, segment);
	return fileHandleOrNull(dir, name);
}

async function directoryOrNull(
	dir: FileSystemDirectoryHandle | null,
	name: string
): Promise<FileSystemDirectoryHandle | null> {
	if (!dir) return null;
	try {
		return await dir.getDirectoryHandle(name);
	} catch {
		// Absent, or a file of that name: nothing to descend either way.
		return null;
	}
}

async function fileHandleOrNull(
	dir: FileSystemDirectoryHandle | null,
	name: string
): Promise<FileSystemFileHandle | null> {
	if (!dir) return null;
	try {
		return await dir.getFileHandle(name);
	} catch {
		return null;
	}
}

async function fileOrNull(
	dir: FileSystemDirectoryHandle | null,
	name: string
): Promise<File | null> {
	const handle = await fileHandleOrNull(dir, name);
	if (!handle) return null;
	try {
		return await handle.getFile();
	} catch {
		return null;
	}
}
