import { afterEach, describe, expect, it, vi } from 'vitest';
import { KINDS, openSource } from './open.ts';
import { localRef, parseRepoPath, type RepoRef } from '../repo/ref.ts';
import { isCached, isFollowable, isLinked, isRereadable } from './capabilities.ts';
import { ListingError, NoSourceError, type Source } from './source.ts';
import { directory, entryTree } from './local/fake-directory.ts';
import { fromDirectoryEntry, fromDirectoryHandle, fromFileList } from './local/folder.ts';
import { closeFolder, openFolder } from './local/kind.ts';

/** `source`, which a spec has just made sure has the capability `is` tests for. */
function having<T>(source: Source, is: (source: Source) => source is Source & T): Source & T {
	if (!is(source)) throw new Error(`${source.label} lacks what ${is.name} asks for`);
	return source;
}

const refs: RepoRef[] = [
	parseRepoPath('owner/repo')!,
	parseRepoPath('owner/repo@main')!,
	parseRepoPath('gitlab.com/group/project')!,
	localRef('my-project')
];

describe('the registry', () => {
	it('keys every kind by its own id', () => {
		// The one thing a literal cannot check itself: that the key written out
		// is the id the kind answers to.
		for (const [key, kind] of Object.entries(KINDS)) expect(key).toBe(kind.id);
	});

	it('holds the kinds this app has, named', () => {
		expect(Object.keys(KINDS).toSorted()).toEqual(['github', 'local']);
	});

	it('is closed to writing, so nothing can register a kind at runtime', () => {
		expect(() => {
			(KINDS as Record<string, unknown>).sneaky = {};
		}).toThrow();
	});

	it('claims nothing twice', () => {
		// The property a record depends on: with disjoint claims there is no
		// precedence to encode, so nothing rests on the order of the keys.
		for (const ref of refs) {
			const claimants = Object.values(KINDS).filter((kind) => kind.claims(ref));
			expect(claimants.map((kind) => kind.id)).toHaveLength(1);
		}
	});
});

describe('openSource', () => {
	it('opens a repository on a forge', () => {
		const source = openSource(parseRepoPath('owner/repo')!);
		expect(source.id).toBe('github');
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

	it('refuses a reference no kind claims, as a host it cannot serve', () => {
		const ref: RepoRef = { host: 'intranet', owner: 'team', name: 'tasks' };
		expect(() => openSource(ref)).toThrow(ListingError);
		expect(() => openSource(ref)).toThrow('intranet is not served');
	});

	it('opens the folder on this machine', () => {
		const source = openSource(localRef());
		expect(source.id).toBe('local');
		// The two capabilities whose absence says what a folder is: nowhere to
		// cache it, and no page anywhere to link one of its files to.
		expect(isCached(source)).toBe(false);
		expect(isLinked(source)).toBe(false);
	});
});

/** A file as the directory input reports it. */
function dropped(path: string, text: string): File {
	const file = new File([text], path.split('/').pop()!);
	Object.defineProperty(file, 'webkitRelativePath', { value: `my-project/${path}` });
	return file;
}

/**
 * What each source does when asked, rather than what it says about itself.
 *
 * The loader's tests cover the reading; these cover the seam it now reads
 * through, which nothing else touches directly.
 */
describe('reading through a forge', () => {
	const ref = parseRepoPath('owner/repo')!;

	it('reads a file from the CDN', async () => {
		const asked: string[] = [];
		const fetchImpl = (async (url: RequestInfo | URL) => {
			asked.push(String(url));
			return new Response('# a task\n', { status: 200 });
		}) as unknown as typeof fetch;

		const source = openSource(ref, { fetchImpl });
		expect(await source.read('tasks/a/TASK.md')).toBe('# a task\n');
		expect(asked).toEqual(['https://raw.githubusercontent.com/owner/repo/HEAD/tasks/a/TASK.md']);
	});

	it('answers null for a file the CDN refuses, rather than throwing', async () => {
		const fetchImpl = (async () =>
			new Response('nope', { status: 404 })) as unknown as typeof fetch;
		expect(await openSource(ref, { fetchImpl }).read('tasks/a/TASK.md')).toBeNull();
	});

	it('answers null when the network does not answer at all', async () => {
		// A read that throws would take the whole load down; one task that cannot
		// be read is listed as skipped instead.
		const fetchImpl = (async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		expect(await openSource(ref, { fetchImpl }).read('tasks/a/TASK.md')).toBeNull();
	});

	it('can be refreshed, having only a request to spend', async () => {
		const source = openSource(ref);
		expect(isRereadable(source)).toBe(true);
		// Nothing for the source to do: a forge's refresh is the loader ignoring
		// the cache.
		await expect(having(source, isRereadable).reread()).resolves.toBeUndefined();
	});
});

describe('reading through a folder', () => {
	const open = (files: File[]) => {
		openFolder(fromFileList(files)!);
		return openSource(localRef());
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
		// No handle was kept, so there is no way back to the folder: the view
		// offers to reopen rather than a Refresh that would do nothing.
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(isRereadable(source)).toBe(false);
	});

	it('is one source for every reading of the folder, until another is picked', async () => {
		// Coming back to the folder finds it as it was last read, and the URLs it
		// handed out still good.
		open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(openSource(localRef())).toBe(openSource(localRef()));
	});

	it('lets go of its folder when another is picked, rather than reading that one', async () => {
		// A source is the folder it was opened on, never whichever is open now:
		// a write from the reading being replaced would otherwise land in the
		// folder just picked, which may be another worktree with the same task ids.
		const before = open([dropped('tasks/20260101-000001/TASK.md', '# before\n')]);
		open([dropped('tasks/20260101-000001/TASK.md', '# after\n')]);

		expect(await before.read('tasks/20260101-000001/TASK.md')).toBeNull();
		await expect(before.list()).rejects.toThrow(NoSourceError);
	});

	it('says so when there is no folder open, rather than listing nothing', async () => {
		closeFolder();
		await expect(openSource(localRef()).list()).rejects.toThrow(/No folder is open/);
	});

	it('keeps the URL of an unchanged file through a refresh, until the folder goes', async () => {
		// The views go on showing a reading until the next one lands, and a body
		// that is not rendered again still links to what was handed out before;
		// one that is comes out as the same HTML.
		const handle = directory('my-project', { 'tasks/20260101-000001/shot.png': 'png' });
		openFolder(await fromDirectoryHandle(handle), handle);
		const source = openSource(localRef());
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
		// The entry tree of a drop walks again on demand, no dialog: measured on
		// Firefox, and what turns its "Reopen…" into a Refresh.
		const tree = { 'tasks/20260101-000001/TASK.md': '# before\n' };
		const entry = entryTree('my-project', tree);
		openFolder(await fromDirectoryEntry(entry), entry);
		const source = openSource(localRef());
		expect(isRereadable(source)).toBe(true);

		tree['tasks/20260101-000001/TASK.md'] = '# after\n';
		await having(source, isRereadable).reread();
		expect(await source.read('tasks/20260101-000001/TASK.md')).toBe('# after\n');
	});
});

describe('following a folder', () => {
	const task = { 'tasks/20260101-000001/TASK.md': '# a\n', '.git/HEAD': 'ref: refs/heads/main\n' };

	/** What `FileSystemObserver` would be asked, and a way to report a change. */
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
		return openSource(localRef());
	};

	afterEach(() => {
		closeFolder();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('is offered only with a way back to the folder, as Refresh is', async () => {
		openFolder(fromFileList([dropped('tasks/20260101-000001/TASK.md', '# a\n')])!);
		expect(isFollowable(openSource(localRef()))).toBe(false);
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
		const stop = having(openSource(localRef()), isFollowable).follow(changed);

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
