/**
 * A folder on the reader's own machine, read as a repository.
 *
 * The one repository this viewer cannot otherwise show is the one someone is
 * working in: private, or simply not pushed. The browser can read a directory
 * the reader chooses, and three doors offer one, with differences that decide
 * the design rather than just the support matrix:
 *
 * - `<input type="file" webkitdirectory>` works in every browser and hands over
 *   a flat list of files, once. There is no way back to the folder afterwards.
 * - `showDirectoryPicker()` is Chromium only and hands over a handle, which can
 *   be walked again, so a refresh is a genuine reread.
 * - a dropped folder gives a handle on Chromium and the legacy entry tree
 *   elsewhere, which makes it the widest door of the three.
 *
 * All three are built, because the first is the floor and the others are worth
 * having where they exist. And all three produce the same thing: a name and a
 * map of paths to files. Which is why they live in one file, unlike a forge's
 * listers: those are independent services, these are one walk in three
 * dialects.
 *
 * Nothing is uploaded. The browser arbitrates the permission and the files stay
 * where they are; this module only reads them.
 */
/**
 * Which door this browser has to a folder. They behave differently enough that
 * the page has to say which one it is about to use.
 *
 * `picker` asks for access to the one folder and keeps a handle, so a refresh
 * rereads it. `input` makes the browser ask by file count instead, because it
 * cannot know a page will not upload what it is given, and hands over a
 * snapshot with no way back. `none` is a browser with neither, where the offer
 * would be a button that cannot work.
 */
export function folderAccess(): 'picker' | 'input' | 'none' {
	if (typeof window === 'undefined') return 'none';
	if (typeof window.showDirectoryPicker === 'function') return 'picker';
	return 'webkitdirectory' in document.createElement('input') ? 'input' : 'none';
}

/**
 * Whether a folder can be dropped on the page.
 *
 * A door of its own, and the widest one: the legacy entry API that carries a
 * drop is in every browser, unlike the picker, and on Chromium a drop hands
 * back a handle, so dropping is the only way a browser without the picker gets
 * a folder it can reread.
 */
export function canDropFolder(): boolean {
	if (typeof DataTransferItem === 'undefined') return false;
	const item = DataTransferItem.prototype;
	return 'getAsFileSystemHandle' in item || 'webkitGetAsEntry' in item;
}

/** A repository read from the disk, as much of it as this viewer looks at. */
export interface LocalFolder {
	/** The folder's own name, which is all the identity a local source has. */
	name: string;
	/** Repository-relative path to file, e.g. `tasks/20260907-011003/TASK.md`. */
	files: Map<string, File>;
}

/**
 * Paths worth keeping out of the map.
 *
 * A checkout holds far more than a `tasks/` folder (`node_modules` alone can
 * be a hundred thousand files), and the reader picked the repository, not a
 * subfolder of it. Only what this viewer reads is kept: the tasks, and the one
 * file that says which branch is checked out.
 */
export function isWorthKeeping(path: string): boolean {
	return path.startsWith('tasks/') || path === '.git/HEAD';
}

/**
 * Whether the folder that was picked is itself the `tasks/` folder.
 *
 * Only the directory input needs to ask: it hands over every file at once, so
 * the shape has to be read out of the paths. A handle is asked for `tasks/` by
 * name instead.
 *
 * Worth accepting at all because of what the reader is shown when they pick
 * with a directory input: the browser cannot know a page will not upload what
 * it is given, so it asks, and it names the count ("import 7,775 files?" for
 * a checkout whose `node_modules` this viewer then throws away). Picking
 * `tasks/` makes that question about forty files instead, and costs only
 * `.git/HEAD`, which is to say the branch name.
 *
 * The test is the layout itself: a task folder holds a `TASK.md`, so a folder
 * of task folders is a tasks folder.
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
 * Reads what `<input type="file" webkitdirectory>` produced.
 *
 * The browser reports each file with a `webkitRelativePath` that begins with
 * the chosen folder's own name, which is where that name comes from: there is
 * no handle to ask.
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
	// Picking `tasks/` is the same repository seen one level down, and the paths
	// are put back the way the rest of this viewer expects them.
	const tasks = looksLikeTasksFolder(inside.keys());
	const files = new Map<string, File>();
	for (const [path, file] of inside) {
		const full = tasks ? `tasks/${path}` : path;
		if (isWorthKeeping(full)) files.set(full, file);
	}

	return { name, files };
}

/**
 * Walks a directory handle, which is the same interface the origin-private file
 * system hands out, so this code is exercised by tests without a file picker.
 *
 * Only `tasks/` is descended, and `.git/HEAD` is fetched by name. Descending
 * everything and filtering afterwards would mean walking `node_modules` and the
 * tens of thousands of loose objects under `.git` to end up with the same forty
 * files. A handle can be asked for a path directly, so it is.
 */
export async function fromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<LocalFolder> {
	const files = new Map<string, File>();

	async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
		for await (const [name, entry] of dir.entries()) {
			const path = `${prefix}/${name}`;
			if (entry.kind === 'directory') await walk(entry, path);
			else files.set(path, await entry.getFile());
		}
	}

	// A repository holds its tasks in `tasks/`; a folder that *is* that one holds
	// them at its root. Either way they end up under `tasks/`, where the rest of
	// this viewer looks for them.
	const inside = await directoryOrNull(handle, 'tasks');
	// And a folder that is neither is left alone. Without this the walk descended
	// the whole selection under a `tasks/` prefix (`node_modules` included), and
	// the loader, seeing paths that begin with `tasks/`, could not say there was
	// no tasks folder: the reader waited, then read "0 tasks".
	if (inside || (await holdsTaskFolders(handle))) await walk(inside ?? handle, 'tasks');

	if (inside) {
		const head = await fileOrNull(await directoryOrNull(handle, '.git'), 'HEAD');
		if (head) files.set('.git/HEAD', head);
	}

	return { name: handle.name, files };
}

/**
 * Whether this folder is itself a `tasks/` folder (the test the directory input
 * makes on paths, asked of a handle): a task folder holds a `TASK.md`, so a
 * folder of task folders is a tasks folder.
 *
 * Only the immediate children, and only until one answers: a real tasks folder
 * costs one lookup, and a mistaken selection costs one per top-level entry
 * rather than a walk of everything beneath it.
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
		// Absent, or a file of that name: either way there is nothing to descend.
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
 * Walks what a dropped folder hands over: the legacy entry tree, which is the
 * only door Firefox and Safari have.
 *
 * Same strategy as the handle walk (ask for `tasks/` and `.git/HEAD` by name
 * rather than descending a checkout), expressed against a callback API. And it
 * holds the trap that API is known for: `readEntries` answers a page at a time
 * and signals the end with an empty array, so reading it once looks like it
 * worked on a small folder and silently loses the rest of a real one.
 */
export async function fromDirectoryEntry(entry: FileSystemDirectoryEntry): Promise<LocalFolder> {
	const files = new Map<string, File>();

	// `Promise.withResolvers` rather than an executor: the paging loop below calls
	// itself from inside the callback, which is exactly the shape that reads
	// badly nested one level deeper inside `new Promise`.
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
			const path = `${prefix}/${found.name}`;
			if (found.isDirectory) await walk(found as FileSystemDirectoryEntry, path);
			else {
				const file = await fileOf(found as FileSystemFileEntry);
				if (file) files.set(path, file);
			}
		}
	}

	const inside = await child<FileSystemDirectoryEntry>(entry, 'tasks', 'getDirectory');
	// Same guard as the handle walk, and needed more here: this is the door a
	// dropped folder takes on Firefox and Safari, where nothing asked the reader
	// to confirm a file count first.
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

/** Every task file the folder holds, in the shape a listing takes. */
export function listFolder(folder: LocalFolder): { path: string; size: number }[] {
	return [...folder.files].map(([path, file]) => ({ path, size: file.size }));
}

/**
 * The checked-out branch, for the header to show something true.
 *
 * A working tree has no branch the way a forge reference does (it is whatever
 * is checked out), but `.git/HEAD` is a file like any other, so the name is
 * readable without a git client. A detached HEAD holds a bare commit id, which
 * is not a branch and is left alone.
 */
export async function readBranch(folder: LocalFolder): Promise<string | undefined> {
	const head = folder.files.get('.git/HEAD');
	if (!head) return undefined;
	const match = /^ref:\s*refs\/heads\/(.+)$/m.exec((await head.text()).trim());
	return match?.[1];
}
