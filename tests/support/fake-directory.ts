/**
 * Stand-ins for what the browser hands over for a folder, which Node lacks: a
 * directory handle, a dropped entry tree and the directory input's file list.
 *
 * The handle and the entry tree read their tree when asked, so a spec can edit
 * it between two readings; the file list is a snapshot, as the input's is.
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
 * A stand-in for the handle `showDirectoryPicker` returns. Given `ask`, it is
 * the handle Chromium hands over, which can write once `ask` answers `granted`
 * to its `requestPermission`; its files are then written into `tree`.
 */
export function directory(
	name: string,
	tree: Record<string, string>,
	ask?: () => Promise<PermissionState>
): FileSystemDirectoryHandle {
	let permission: PermissionState = 'prompt';
	const permissions = ask && {
		queryPermission: async () => permission,
		requestPermission: async () => {
			permission = await ask();
			return permission;
		}
	};

	const handleOf = (prefix: string, child: string, found: Child) => {
		const path = join(prefix, child);
		if (found.kind === 'directory') return build(child, path);
		return {
			kind: 'file',
			name: child,
			getFile: async () => {
				if (!Object.hasOwn(tree, path)) throw new DOMException('missing', 'NotFoundError');
				// Fixed, so a reread sees the file as unchanged.
				return new File([tree[path]], child, { lastModified: 0 });
			},
			...(permissions && { createWritable: async () => writableAt(path) })
		} as unknown as FileSystemFileHandle;
	};

	/** A stream that replaces the file at `path` on `close`, as Chromium's does. */
	const writableAt = (path: string) => {
		if (permission !== 'granted') throw new DOMException('not allowed', 'NotAllowedError');
		let written = '';
		return {
			write: async (text: string) => {
				written += text;
			},
			close: async () => {
				tree[path] = written;
			}
		};
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
			...permissions,
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
 * A stand-in for the entry tree of a dropped folder. Its `readEntries` answers
 * `page` entries at a time, so a walk that reads a single page loses files.
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
