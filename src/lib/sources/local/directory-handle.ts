/**
 * A folder handed over as a directory handle, by `showDirectoryPicker()` or by a
 * drop on Chromium.
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
		if (await fileOrNull(entry, 'TASK.md')) return true;
	}
	return false;
}

async function directoryOrNull(
	dir: FileSystemDirectoryHandle,
	name: string
): Promise<FileSystemDirectoryHandle | null> {
	try {
		return await dir.getDirectoryHandle(name);
	} catch {
		// Absent, or a file of that name: nothing to descend either way.
		return null;
	}
}

async function fileOrNull(
	dir: FileSystemDirectoryHandle | null,
	name: string
): Promise<File | null> {
	if (!dir) return null;
	try {
		return await (await dir.getFileHandle(name)).getFile();
	} catch {
		return null;
	}
}
