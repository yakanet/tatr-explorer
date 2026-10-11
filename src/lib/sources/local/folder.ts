/**
 * Reads a folder on the reader's machine as a repository, through one of three
 * browser APIs:
 *
 * - `<input type="file" webkitdirectory>`, in every browser, hands over a flat
 *   list of files once, with no way back to the folder.
 * - `showDirectoryPicker()`, on Chromium only, hands over a handle that can be
 *   walked again.
 * - a drop hands over a handle on Chromium and a legacy entry tree elsewhere,
 *   both of which can be walked again.
 *
 * All three produce a `LocalFolder`, so they share this file.
 */

/**
 * How this browser lets the reader pick a folder, so the page can say what will
 * happen: `picker` keeps a handle a refresh rereads, `input` makes the browser
 * confirm a file count and hands over a snapshot, `none` offers neither.
 */
export function folderAccess(): 'picker' | 'input' | 'none' {
	if (typeof window === 'undefined') return 'none';
	if (typeof window.showDirectoryPicker === 'function') return 'picker';
	if ('webkitdirectory' in document.createElement('input')) return 'input';
	return 'none';
}

/**
 * Whether a folder can be dropped on the page. A drop is the only way a browser
 * without `showDirectoryPicker` gets a folder it can reread.
 */
export function canDropFolder(): boolean {
	if (typeof DataTransferItem === 'undefined') return false;
	const item = DataTransferItem.prototype;
	return 'getAsFileSystemHandle' in item || 'webkitGetAsEntry' in item;
}

/** What lets a folder be walked again: a directory handle, or the entry tree of a drop. */
export type WayBack = FileSystemDirectoryHandle | FileSystemDirectoryEntry;

/** Walks a folder again through its `WayBack`, stopping at the next entry once `signal` aborts. */
export function fromWayBack(back: WayBack, signal?: AbortSignal): Promise<LocalFolder> {
	if ('kind' in back) return fromDirectoryHandle(back, signal);
	return fromDirectoryEntry(back, signal);
}

/** A folder read from the disk: its name, and the files this viewer reads. */
export interface LocalFolder {
	/** The folder's name, which is all the identity a local source has. */
	name: string;
	/** Each file by its path from the repository root, such as `tasks/20260907-011003/TASK.md`. */
	files: Map<string, File>;
}

/**
 * Whether this viewer reads `path`: the tasks, and `.git/HEAD` for the branch.
 * The reader picks a whole checkout, where `node_modules` alone can hold a
 * hundred thousand files.
 */
export function isWorthKeeping(path: string): boolean {
	return path.startsWith('tasks/') || path === '.git/HEAD';
}

/**
 * Whether the directory input was given the `tasks/` folder itself: a folder of
 * task folders, each holding a `TASK.md`. Accepted because the browser asks the
 * reader to confirm the file count, and `tasks/` alone keeps it small; only the
 * branch is lost.
 */
export function looksLikeTasksFolder(paths: Iterable<string>): boolean {
	let holdsTasks = false;
	for (const path of paths) {
		if (path.startsWith('tasks/')) return false;
		if (/^[^/]+\/TASK\.md$/.test(path)) holdsTasks = true;
	}
	return holdsTasks;
}

/**
 * Reads the files `<input type="file" webkitdirectory>` handed over, or returns
 * null when they carry no relative path. The folder's name is the first segment
 * of each `webkitRelativePath`, as there is no handle to ask.
 */
export function fromFileList(list: ArrayLike<File>): LocalFolder | null {
	const inside = new Map<string, File>();
	let name = '';

	for (let i = 0; i < list.length; i++) {
		const file = list[i];
		const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
		if (!relative) continue;
		const cut = relative.indexOf('/');
		if (cut === -1) continue;
		if (!name) name = relative.slice(0, cut);
		inside.set(relative.slice(cut + 1), file);
	}

	if (!name) return null;
	// The rest of the viewer expects every task under `tasks/`.
	let prefix = '';
	if (looksLikeTasksFolder(inside.keys())) prefix = 'tasks/';
	const files = new Map<string, File>();
	for (const [path, file] of inside) {
		const full = `${prefix}${path}`;
		if (isWorthKeeping(full)) files.set(full, file);
	}

	return { name, files };
}

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

/**
 * Reads a dropped folder through the legacy entry tree, the only drop API on
 * Firefox and Safari. Like the handle walk, it asks for `tasks/` and
 * `.git/HEAD` by name.
 */
export async function fromDirectoryEntry(
	entry: FileSystemDirectoryEntry,
	signal?: AbortSignal
): Promise<LocalFolder> {
	const files = new Map<string, File>();

	// `readEntries` answers a page at a time and ends with an empty array, so it
	// is called until then: one call silently drops all but the first page.
	// `Promise.withResolvers` keeps that recursion out of a promise executor.
	const read = (dir: FileSystemDirectoryEntry) => {
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
	};

	const child = <T extends FileSystemEntry>(
		dir: FileSystemDirectoryEntry,
		name: string,
		kind: 'getDirectory' | 'getFile'
	) =>
		new Promise<T | null>((resolve) => {
			dir[kind](
				name,
				{},
				(found) => resolve(found as T),
				() => resolve(null)
			);
		});

	const fileOf = (found: FileSystemFileEntry) =>
		new Promise<File | null>((resolve) => found.file(resolve, () => resolve(null)));

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

	const inside = await child<FileSystemDirectoryEntry>(entry, 'tasks', 'getDirectory');
	// Same rule as `tasksDirectoryOf`: a folder that is neither is not walked.
	const holdsTasks = async () => {
		for (const found of await read(entry)) {
			if (!found.isDirectory) continue;
			if (
				await child<FileSystemFileEntry>(found as FileSystemDirectoryEntry, 'TASK.md', 'getFile')
			) {
				return true;
			}
		}
		return false;
	};
	if (inside || (await holdsTasks())) await walk(inside ?? entry, 'tasks');

	if (inside) {
		const git = await child<FileSystemDirectoryEntry>(entry, '.git', 'getDirectory');
		const head = git && (await child<FileSystemFileEntry>(git, 'HEAD', 'getFile'));
		const file = head && (await fileOf(head));
		if (file) files.set('.git/HEAD', file);
	}

	return { name: entry.name, files };
}

/** Every file the folder holds, as listing entries with their size. */
export function listFolder(folder: LocalFolder): { path: string; size: number }[] {
	return [...folder.files].map(([path, file]) => ({ path, size: file.size }));
}

/** The checked-out branch `.git/HEAD` names, or undefined without one. */
export async function readBranch(folder: LocalFolder): Promise<string | undefined> {
	const head = folder.files.get('.git/HEAD');
	if (!head) return undefined;
	return branchFromHead(await head.text());
}

/**
 * The branch named by the text of a `.git/HEAD`, or undefined for a detached
 * HEAD, which holds a commit id. Separate from `readBranch`, as the dev server
 * reads that file from Node.
 */
export function branchFromHead(text: string): string | undefined {
	return /^ref:\s*refs\/heads\/(.+)$/m.exec(text.trim())?.[1];
}
