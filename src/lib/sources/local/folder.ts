/**
 * Reads a folder on the reader's machine as a repository. A browser hands one
 * over in one of three ways: `<input type="file" webkitdirectory>`, in every
 * browser, gives a flat list of files once, read here; `showDirectoryPicker()`,
 * on Chromium only, gives a handle (`directory-handle.ts`); a drop gives a
 * handle on Chromium and a legacy entry tree elsewhere (`drop.ts`,
 * `directory-entry.ts`). A handle and an entry tree can be walked again. All
 * three produce a `LocalFolder`.
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
