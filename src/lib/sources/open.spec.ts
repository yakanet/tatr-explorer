import { afterEach, describe, expect, it, vi } from 'vitest';
import { directory, entryTree, fileList } from '#tests/support/fake-directory.ts';
import { SOURCES, openSource, parseRepoPath } from './open.ts';
import { parseForgePath } from '../repo/ref.ts';
import { isCached, isFollowable, isLinked, isRereadable, isWritable } from './capabilities.ts';
import { SourceError, type Source } from './contract.ts';
import { fromDirectoryEntry } from './local/directory-entry.ts';
import { fromDirectoryHandle } from './local/directory-handle.ts';
import { fromFileList } from './local/folder.ts';
import { GitHubRepositorySource } from './github/source.ts';
import { closeFolder, LocalFolderSource, openFolder } from './local/source.ts';

/** The reference to the folder on this machine, as this site's URL names it. */
const LOCAL = parseRepoPath('local')!;

/** `source`, narrowed to the capability `is` checks, or a throw when it lacks it. */
function having<T>(source: Source, is: (source: Source) => source is Source & T): Source & T {
	if (!is(source)) throw new Error(`${source.label} lacks what ${is.name} asks for`);
	return source;
}

describe('the registry', () => {
	it('holds the sources this app has, named', () => {
		expect(Object.keys(SOURCES).toSorted()).toEqual(['github', 'local']);
	});

	it('is closed to writing, so nothing can register a source at runtime', () => {
		expect(() => {
			(SOURCES as Record<string, unknown>).sneaky = {};
		}).toThrow();
	});

	it('gives no path and no host to two sources', () => {
		const addresses = Object.values(SOURCES).flatMap((sourceClass) => {
			if ('path' in sourceClass.address) return [sourceClass.address.path];
			return [...sourceClass.address.hosts];
		});
		expect(new Set(addresses).size).toBe(addresses.length);
	});
});

describe('our own addresses', () => {
	it('read a forge address on any host, a host nothing reads included', () => {
		expect(parseRepoPath('owner/repo')).toEqual({
			...parseForgePath('owner/repo'),
			source: 'github'
		});
		expect(parseRepoPath('gitlab.com/group/project')).toMatchObject({
			host: 'gitlab.com',
			source: null
		});
	});

	it("read a source's path as its address, and nothing else as one", () => {
		expect(LOCAL).toEqual({ source: 'local', path: 'local' });
		expect(parseRepoPath('nothing')).toBeNull();
	});

	it('leave the served folder out where none is served, as here and in a build', () => {
		// Only the dev server serves a folder, and these specs run without one.
		expect(parseRepoPath('served')).toBeNull();
	});
});

describe('openSource', () => {
	it('opens a repository on a forge', () => {
		const source = openSource(parseRepoPath('owner/repo')!);
		expect(source).toBeInstanceOf(GitHubRepositorySource);
		expect(source.label).toBe('owner/repo');
		expect(having(source, isCached).cacheKey).toBe('github.com/owner/repo@');
		expect(having(source, isLinked).fileUrl('tasks/a/TASK.md')).toContain(
			'/blob/HEAD/tasks/a/TASK.md'
		);
	});

	it('reads a forge at the branch its reference names', () => {
		const source = openSource(parseRepoPath('owner/repo@dev')!);
		expect(source.assetUrl('tasks/a/shot.png')).toContain('/repo/dev/tasks/a/shot.png');
	});

	it('refuses a host nothing reads, saying which ones are', () => {
		const ref = parseRepoPath('gitlab.com/group/project')!;
		expect(() => openSource(ref)).toThrow(SourceError);
		expect(() => openSource(ref)).toThrow(
			'Nothing reads gitlab.com yet: the hosts read are github.com.'
		);
	});

	it('opens the folder on this machine', () => {
		closeFolder();
		const source = openSource(LOCAL);
		expect(source).toBeInstanceOf(LocalFolderSource);
		// No folder is open, as after a reload, and the reading still has a name.
		expect(source.label).toBe('a folder on this machine');
		expect(isCached(source)).toBe(false);
		expect(isLinked(source)).toBe(false);
	});
});

/** A file as the directory input reports it. */
function dropped(path: string, text: string): File {
	return fileList('my-project', { [path]: text })[0];
}

/** What each source does, opened through `openSource` as the application opens it. */
describe('reading through a forge', () => {
	const ref = parseRepoPath('owner/repo')!;

	it('can be refreshed, having only a request to spend', async () => {
		const source = openSource(ref);
		expect(isRereadable(source)).toBe(true);
		await expect(having(source, isRereadable).reread()).resolves.toBeUndefined();
	});
});

describe('reading through a folder', () => {
	const open = (files: File[]) => {
		openFolder(fromFileList(files)!);
		return openSource(LOCAL);
	};

	afterEach(() => closeFolder());

	it('reads a file that is already in memory', async () => {
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# from the disk\n')]);
		expect(await source.read('tasks/20260101-000001/TASK.md')).toBe('# from the disk\n');
	});

	it('answers null for a path the folder does not hold', async () => {
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(await source.read('tasks/20260101-000002/TASK.md')).toBeNull();
		expect(source.assetUrl('tasks/20260101-000002/shot.png')).toBeNull();
	});

	it('names itself after the folder, which no URL carries', () => {
		expect(open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]).label).toBe('my-project');
	});

	it('cannot be refreshed when the folder came from a directory input', () => {
		// A directory input gives no handle, so there is no way back to the folder.
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(isRereadable(source)).toBe(false);
	});

	it('is one source for every reading of the folder, until another is picked', async () => {
		// Coming back to the folder finds it as last read, and the URLs it handed out still valid.
		open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(openSource(LOCAL)).toBe(openSource(LOCAL));
	});

	it('lets go of its folder when another is picked, rather than reading that one', async () => {
		// Otherwise a write from the replaced reading would land in the folder
		// just picked, which may be another worktree with the same task ids.
		const before = open([dropped('tasks/20260101-000001/TASK.md', '# before\n')]);
		open([dropped('tasks/20260101-000001/TASK.md', '# after\n')]);

		expect(await before.read('tasks/20260101-000001/TASK.md')).toBeNull();
		await expect(before.list()).rejects.toMatchObject({ failure: 'no-source' });
	});

	it('says so when there is no folder open, rather than listing nothing', async () => {
		closeFolder();
		await expect(openSource(LOCAL).list()).rejects.toThrow(/a reload takes it back/);
	});

	it('keeps the URL of an unchanged file through a refresh, until the folder goes', async () => {
		// A view shows the old reading, and links to its URLs, until the next one
		// lands; a body rendered again then comes out as the same HTML.
		const handle = directory('my-project', { 'tasks/20260101-000001/shot.png': 'png' });
		openFolder(await fromDirectoryHandle(handle), handle);
		const source = openSource(LOCAL);
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const before = source.assetUrl('tasks/20260101-000001/shot.png');

		await having(source, isRereadable).reread();
		expect(source.assetUrl('tasks/20260101-000001/shot.png')).toBe(before);
		expect(revoke).not.toHaveBeenCalled();

		closeFolder();
		expect(revoke).toHaveBeenCalledWith(before);
		revoke.mockRestore();
	});

	it('can be refreshed when it was dropped on Firefox, reading what changed on disk', async () => {
		// A drop's entry tree walks again without a dialog (checked on Firefox),
		// so a dropped folder offers Refresh rather than "Reopen…".
		const tree = { 'tasks/20260101-000001/TASK.md': '# before\n' };
		const entry = entryTree('my-project', tree);
		openFolder(await fromDirectoryEntry(entry), entry);
		const source = openSource(LOCAL);
		expect(isRereadable(source)).toBe(true);

		tree['tasks/20260101-000001/TASK.md'] = '# after\n';
		await having(source, isRereadable).reread();
		expect(await source.read('tasks/20260101-000001/TASK.md')).toBe('# after\n');
	});

	it('keeps the later of two overlapping refreshes, whichever finishes last', async () => {
		// A followed change and a click can overlap, and the first walk, holding
		// the older tree, may finish last. The later reading aborts the earlier
		// one's signal, as the page does.
		const path = 'tasks/20260101-000001/TASK.md';
		const older = directory('my-project', { [path]: '# older\n' });
		const newer = directory('my-project', { [path]: '# newer\n' });
		const { promise: held, resolve: release } = Promise.withResolvers<void>();
		let holding = true;
		// The first walk is held at `tasks/`, then reads the older tree.
		const handle = {
			...newer,
			async getDirectoryHandle(name: string) {
				if (!holding) return newer.getDirectoryHandle(name);
				holding = false;
				await held;
				return older.getDirectoryHandle(name);
			}
		} as FileSystemDirectoryHandle;
		openFolder(await fromDirectoryHandle(newer), handle);
		const source = having(openSource(LOCAL), isRereadable);

		const earlier = new AbortController();
		const first = source.reread(earlier.signal);
		earlier.abort();
		await source.reread();
		release();

		await expect(first).rejects.toThrow();
		expect(await source.read(path)).toBe('# newer\n');
	});
});

describe('following a folder', () => {
	const task = { 'tasks/20260101-000001/TASK.md': '# a\n', '.git/HEAD': 'ref: refs/heads/main\n' };

	/** A fake `FileSystemObserver`: what it was asked, and a way to report a change. */
	const observer = (fails = false) => {
		const seen = { observed: '', recursive: false, disconnected: false };
		let report: (records: FileSystemChangeRecord[]) => void = () => {};
		vi.stubGlobal(
			'FileSystemObserver',
			class {
				constructor(callback: typeof report) {
					report = callback;
				}
				async observe(handle: FileSystemHandle, options?: { recursive?: boolean }) {
					if (fails) throw new DOMException('refused', 'NotAllowedError');
					seen.observed = handle.name;
					seen.recursive = options?.recursive ?? false;
				}
				disconnect() {
					seen.disconnected = true;
				}
			}
		);
		// Any record will do: every change is followed, whatever it touched.
		const change = () =>
			report([{ type: 'modified', relativePathComponents: ['20260101-000001', 'TASK.md'] }]);
		return { seen, change };
	};

	const picked = async () => {
		const handle = directory('my-project', task);
		openFolder(await fromDirectoryHandle(handle), handle);
		return openSource(LOCAL);
	};

	afterEach(() => {
		closeFolder();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('is offered only with a way back to the folder, as Refresh is', async () => {
		openFolder(fromFileList([dropped('tasks/20260101-000001/TASK.md', '# a\n')])!);
		expect(isFollowable(openSource(LOCAL))).toBe(false);
		expect(isFollowable(await picked())).toBe(true);
	});

	it('watches `tasks/` alone, where FileSystemObserver exists', async () => {
		// The rest of a checkout, `.git` and `node_modules`, moves far more often.
		const { seen } = observer();
		const stop = having(await picked(), isFollowable).follow(() => {});
		await vi.waitFor(() => expect(seen.observed).toBe('tasks'));
		expect(seen.recursive).toBe(true);

		stop();
		expect(seen.disconnected).toBe(true);
	});

	it('reports a burst of writes once it settles, as one save', async () => {
		const { seen, change } = observer();
		const changed = vi.fn();
		having(await picked(), isFollowable).follow(changed);
		await vi.waitFor(() => expect(seen.observed).toBe('tasks'));

		vi.useFakeTimers();
		change();
		change();
		change();
		expect(changed).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it('follows the focus where nothing observes the folder, as on Firefox', async () => {
		vi.stubGlobal('window', new EventTarget());
		const entry = entryTree('my-project', task);
		openFolder(await fromDirectoryEntry(entry), entry);
		const changed = vi.fn();
		const stop = having(openSource(LOCAL), isFollowable).follow(changed);

		window.dispatchEvent(new Event('focus'));
		expect(changed).toHaveBeenCalledTimes(1);
		stop();
		window.dispatchEvent(new Event('focus'));
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it('falls back on the focus when the folder refuses to be observed', async () => {
		vi.stubGlobal('window', new EventTarget());
		observer(true);
		const changed = vi.fn();
		having(await picked(), isFollowable).follow(changed);

		await vi.waitFor(() => {
			window.dispatchEvent(new Event('focus'));
			expect(changed).toHaveBeenCalled();
		});
	});
});

describe('writing to a folder', () => {
	const path = 'tasks/20260101-000001/TASK.md';
	const before = '# a\n\n- STATUS: OPEN\n';
	const after = '# a\n\n- STATUS: CLOSED\n';

	/**
	 * A folder picked on Chromium, whose reader answers `ask`, and the tree it
	 * writes to. Without `ask`, the handle is one that cannot ask.
	 */
	const picked = async (ask?: () => Promise<PermissionState>) => {
		const tree: Record<string, string> = { [path]: before };
		const handle = directory('my-project', tree, ask);
		openFolder(await fromDirectoryHandle(handle), handle);
		return { tree, source: openSource(LOCAL) };
	};

	afterEach(() => closeFolder());

	it('is offered only where the browser hands over a handle that can ask to write', async () => {
		expect(isWritable((await picked(async () => 'granted')).source)).toBe(true);
		expect(isWritable((await picked()).source)).toBe(false);

		const entry = entryTree('my-project', { [path]: before });
		openFolder(await fromDirectoryEntry(entry), entry);
		expect(isWritable(openSource(LOCAL))).toBe(false);

		openFolder(fromFileList([dropped(path, before)])!);
		expect(isWritable(openSource(LOCAL))).toBe(false);
	});

	it('asks the reader on the first write only, and writes once allowed', async () => {
		const ask = vi.fn(async (): Promise<PermissionState> => 'granted');
		const { tree, source } = await picked(ask);

		expect(await having(source, isWritable).write(path, after, before)).toBe('written');
		expect(tree[path]).toBe(after);
		expect(await having(source, isWritable).write(path, before, after)).toBe('written');
		expect(ask).toHaveBeenCalledTimes(1);
	});

	it('answers refused when the reader says no, and does not ask again', async () => {
		const ask = vi.fn(async (): Promise<PermissionState> => 'denied');
		const { tree, source } = await picked(ask);

		expect(await having(source, isWritable).write(path, after, before)).toBe('refused');
		expect(await having(source, isWritable).write(path, after, before)).toBe('refused');
		expect(ask).toHaveBeenCalledTimes(1);
		expect(tree[path]).toBe(before);
	});

	it('asks again when the browser would not ask, long after the last click', async () => {
		const ask = vi
			.fn<() => Promise<PermissionState>>()
			.mockRejectedValueOnce(new DOMException('User activation is required', 'SecurityError'))
			.mockResolvedValue('granted');
		const { source } = await picked(ask);

		await expect(having(source, isWritable).write(path, after, before)).rejects.toBeInstanceOf(
			SourceError
		);
		expect(await having(source, isWritable).write(path, after, before)).toBe('written');
	});

	it('answers changed for a file removed since it was read', async () => {
		const { tree, source } = await picked(async () => 'granted');
		delete tree[path];
		expect(await having(source, isWritable).write(path, after, before)).toBe('changed');
	});

	it('writes nothing once another folder is opened', async () => {
		const { tree, source } = await picked(async () => 'granted');
		closeFolder();
		await expect(having(source, isWritable).write(path, after, before)).rejects.toBeInstanceOf(
			SourceError
		);
		expect(tree[path]).toBe(before);
	});
});
