/**
 * A stand-in for what `showDirectoryPicker` returns, for the specs: nothing in
 * the application imports it, so it never reaches a build. Its own file because
 * two specs walk one, the folder's and the source's that rereads it.
 *
 * The real one is exercised by the origin-private file system, which hands out
 * this same interface, but that lives in a browser, and what is worth pinning
 * here is the walk: which branches it descends and which it refuses.
 */
export function directory(name: string, tree: Record<string, string>): FileSystemDirectoryHandle {
	const build = (dirName: string, prefix: string): FileSystemDirectoryHandle => {
		const children = new Map<string, FileSystemDirectoryHandle | FileSystemFileHandle>();
		for (const [path, contents] of Object.entries(tree)) {
			if (prefix && !path.startsWith(`${prefix}/`)) continue;
			const rest = prefix ? path.slice(prefix.length + 1) : path;
			const cut = rest.indexOf('/');
			if (cut === -1) {
				children.set(rest, {
					kind: 'file',
					name: rest,
					// Fixed, as on a disk where nobody touched the file between two reads.
					getFile: async () => new File([contents], rest, { lastModified: 0 })
				} as unknown as FileSystemFileHandle);
			} else {
				const child = rest.slice(0, cut);
				if (!children.has(child)) {
					children.set(child, build(child, prefix ? `${prefix}/${child}` : child));
				}
			}
		}
		return {
			kind: 'directory',
			name: dirName,
			entries: async function* () {
				yield* children.entries();
			},
			getDirectoryHandle: async (child: string) => {
				const found = children.get(child);
				if (found?.kind !== 'directory') throw new DOMException('missing', 'NotFoundError');
				return found;
			},
			getFileHandle: async (child: string) => {
				const found = children.get(child);
				if (found?.kind !== 'file') throw new DOMException('missing', 'NotFoundError');
				return found;
			}
		} as unknown as FileSystemDirectoryHandle;
	};

	return build(name, '');
}
