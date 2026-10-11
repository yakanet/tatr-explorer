/**
 * Stand-ins for what the browser hands over for a folder, for the specs:
 * nothing in the application imports this file, so it never reaches a build.
 * Its own file because several specs use them, the folder's and the source's
 * among them, one per door a browser offers to a folder.
 *
 * The two with a way back read their tree when asked rather than when built,
 * so a spec can change the tree between two readings, as an editor changes a
 * folder on the disk. The file list is built once, a snapshot, as the input's
 * is.
 */

/** One entry directly under a directory: a file and what it holds, or a directory. */
type Child = { kind: 'file'; contents: string } | { kind: 'directory' };

/** `path` as seen from the directory `prefix`, or null when it is not under it. */
function under(prefix: string, path: string): string | null {
	if (!prefix) return path;
	if (!path.startsWith(`${prefix}/`)) return null;
	return path.slice(prefix.length + 1);
}

/** What lies directly under `prefix` in `tree`, as it stands now. */
function childrenOf(tree: Record<string, string>, prefix: string): Map<string, Child> {
	const children = new Map<string, Child>();
	for (const [path, contents] of Object.entries(tree)) {
		const rest = under(prefix, path);
		if (rest === null) continue;
		const cut = rest.indexOf('/');
		if (cut === -1) children.set(rest, { kind: 'file', contents });
		else children.set(rest.slice(0, cut), { kind: 'directory' });
	}
	return children;
}

function join(prefix: string, name: string): string {
	if (!prefix) return name;
	return `${prefix}/${name}`;
}

/**
 * A stand-in for what `showDirectoryPicker` returns.
 *
 * The real one is exercised by the origin-private file system, which hands out
 * this same interface, but that lives in a browser, and what is worth pinning
 * here is the walk: which branches it descends and which it refuses.
 */
export function directory(name: string, tree: Record<string, string>): FileSystemDirectoryHandle {
	const handleOf = (prefix: string, child: string, found: Child) => {
		if (found.kind === 'directory') return build(child, join(prefix, child));
		return {
			kind: 'file',
			name: child,
			// Fixed, as on a disk where nobody touched the file between two reads.
			getFile: async () => new File([found.contents], child, { lastModified: 0 })
		} as unknown as FileSystemFileHandle;
	};

	const build = (dirName: string, prefix: string): FileSystemDirectoryHandle => {
		const lookup = (child: string, kind: Child['kind']) => {
			const found = childrenOf(tree, prefix).get(child);
			if (found?.kind !== kind) throw new DOMException('missing', 'NotFoundError');
			return handleOf(prefix, child, found);
		};
		return {
			kind: 'directory',
			name: dirName,
			entries: async function* () {
				for (const [child, found] of childrenOf(tree, prefix)) {
					yield [child, handleOf(prefix, child, found)];
				}
			},
			getDirectoryHandle: async (child: string) => lookup(child, 'directory'),
			getFileHandle: async (child: string) => lookup(child, 'file')
		} as unknown as FileSystemDirectoryHandle;
	};

	return build(name, '');
}

/**
 * A stand-in for what a dropped folder hands over, callbacks and all. It
 * answers `readEntries` two at a time, because a reader that returns everything
 * at once cannot catch the bug that API is famous for.
 */
export function entryTree(
	name: string,
	tree: Record<string, string>,
	page = 2
): FileSystemDirectoryEntry {
	const entryOf = (prefix: string, child: string, found: Child): FileSystemEntry => {
		if (found.kind === 'directory') return build(child, join(prefix, child));
		return {
			isDirectory: false,
			isFile: true,
			name: child,
			file: (ok: (file: File) => void) => ok(new File([found.contents], child))
		} as unknown as FileSystemEntry;
	};

	const build = (dirName: string, prefix: string): FileSystemDirectoryEntry => {
		const find = (path: string) => {
			const child = path.split('/')[0];
			const found = childrenOf(tree, prefix).get(child);
			return found && entryOf(prefix, child, found);
		};

		return {
			isDirectory: true,
			isFile: false,
			name: dirName,
			createReader: () => {
				const all = [...childrenOf(tree, prefix)].map(([child, found]) =>
					entryOf(prefix, child, found)
				);
				let at = 0;
				return {
					readEntries: (ok: (batch: FileSystemEntry[]) => void) => {
						const batch = all.slice(at, at + page);
						at += batch.length;
						ok(batch);
					}
				};
			},
			getDirectory: (
				path: string,
				_options: unknown,
				ok: (found: FileSystemEntry) => void,
				fail: () => void
			) => {
				const found = find(path);
				if (found?.isDirectory) ok(found);
				else fail();
			},
			getFile: (
				path: string,
				_options: unknown,
				ok: (found: FileSystemEntry) => void,
				fail: () => void
			) => {
				const found = find(path);
				if (found?.isFile) ok(found);
				else fail();
			}
		} as unknown as FileSystemDirectoryEntry;
	};

	return build(name, '');
}

/**
 * What `<input type="file" webkitdirectory>` hands over for a folder of that
 * name: a flat list, each file carrying its path from the folder chosen.
 */
export function fileList(name: string, tree: Readonly<Record<string, string>>): File[] {
	return Object.entries(tree).map(([path, contents]) => {
		const file = new File([contents], path.split('/').pop()!);
		Object.defineProperty(file, 'webkitRelativePath', { value: `${name}/${path}` });
		return file;
	});
}
