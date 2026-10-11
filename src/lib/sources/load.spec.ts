import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import rawTasks from '../../../tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { localRef, parseRepoPath } from '../repo/ref.ts';
import { memoryStore } from './store.ts';
import { NoTasksFolderError, loadRepository } from './load.ts';
import { githubKind } from './github/kind.ts';
import { fromFileList } from './local/folder.ts';
import { closeFolder, localKind, openFolder } from './local/kind.ts';
import type { Snapshot } from '../tatr/changes.ts';
import { ListingError, NoSourceError, type Listing, type OpenOptions } from './source.ts';

const sources = rawTasks as Record<string, string>;
const ref = parseRepoPath('tsoding/tatr')!;

/** A lister that answers from the embedded fixture. */
function fakeLister(overrides: Partial<Listing> = {}) {
	return async (): Promise<Listing> => ({
		entries: [
			...Object.keys(sources).map((id) => ({ path: `tasks/${id}/TASK.md`, size: 1 })),
			{ path: 'tasks/tags' },
			{ path: 'README.md' }
		],
		branch: 'HEAD',
		...overrides
	});
}

const failing =
	(name: string, failure: 'rate-limited' | 'not-found' | 'network') =>
	async (): Promise<Listing> => {
		throw new ListingError(failure, name, failure);
	};

/** Serves task files, and the tags file, from the fixture. */
const fetchFixture = vi.fn(async (input: RequestInfo | URL) => {
	const url = String(input);
	const match = /tasks\/([^/]+)\/TASK\.md$/.exec(url);
	if (match && sources[match[1]]) {
		return new Response(sources[match[1]], { status: 200 });
	}
	if (url.endsWith('tasks/tags')) {
		return new Response('bug , unintended behavior\nrelease , planned for the next release\n', {
			status: 200
		});
	}
	return new Response('not found', { status: 404 });
}) as unknown as typeof fetch;

/** The forge, opened over substitutes for the network. */
const github = (options: OpenOptions) => githubKind.open(ref, options);

/** The fixture's 79 tasks, as the forge serves them, listed by `lister`. */
const fixture = (lister = fakeLister()) => github({ listers: [lister], fetchImpl: fetchFixture });

let store = memoryStore();

beforeEach(() => {
	store = memoryStore();
	vi.clearAllMocks();
});

describe('lister fallback', () => {
	/**
	 * Through the door the application uses: the chain is the forge's own
	 * business, reached by opening the source and asking it to list.
	 */
	const list = (listers: OpenOptions['listers']) => github({ listers }).list();

	// A listing no longer says who produced it, so the question is put to the
	// listers themselves, which is the stronger form of it anyway: that the
	// second was asked, rather than that the answer carries its name.
	it('stops at the first lister that answers', async () => {
		const first = fakeLister();
		const second = vi.fn(fakeLister());

		const listing = await list([first, second]);

		expect(listing.entries.length).toBeGreaterThan(0);
		expect(second).not.toHaveBeenCalled();
	});

	it('falls through when the budget is spent', async () => {
		const second = vi.fn(fakeLister());

		const listing = await list([failing('github', 'rate-limited'), second]);

		expect(second).toHaveBeenCalled();
		expect(listing.entries.length).toBeGreaterThan(0);
	});

	it('does not ask the others when the repository does not exist', async () => {
		const second = vi.fn(fakeLister());
		await expect(list([failing('github', 'not-found'), second])).rejects.toThrow(ListingError);
		expect(second).not.toHaveBeenCalled();
	});

	it('rethrows when every lister fails', async () => {
		await expect(
			list([failing('github', 'rate-limited'), failing('ungh', 'network')])
		).rejects.toThrow(ListingError);
	});
});

describe('loadRepository', () => {
	it('reads every task in the repository', async () => {
		const result = await loadRepository(fixture(), { store });
		expect(result.tasks).toHaveLength(79);
		expect(result.tasks.filter((task) => !task.closed)).toHaveLength(33);
		expect(result.skipped).toEqual([]);
	});

	it('reads the tag descriptions when the file is listed', async () => {
		const result = await loadRepository(fixture(), { store });
		expect(result.tags.descriptions.get('release')).toBe('planned for the next release');
	});

	it('reports progress as files arrive', async () => {
		const onProgress = vi.fn();
		await loadRepository(fixture(), {
			store,
			onProgress
		});
		expect(onProgress).toHaveBeenCalledTimes(79);
		expect(onProgress).toHaveBeenLastCalledWith(79, 79);
	});

	it('honours the concurrency limit', async () => {
		let inFlight = 0;
		let peak = 0;
		const counting = (async (input: RequestInfo | URL) => {
			peak = Math.max(peak, ++inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight -= 1;
			return fetchFixture(input);
		}) as unknown as typeof fetch;

		await loadRepository(github({ listers: [fakeLister()], fetchImpl: counting }), {
			store,
			concurrency: 4
		});
		expect(peak).toBeLessThanOrEqual(4);
	});

	it('refuses a repository with no tasks folder', async () => {
		const bare = async (): Promise<Listing> => ({
			entries: [{ path: 'README.md' }],
			branch: 'HEAD'
		});
		await expect(loadRepository(fixture(bare), { store })).rejects.toThrow(NoTasksFolderError);
	});

	it('lists unreadable tasks instead of dropping them', async () => {
		const flaky = (async (input: RequestInfo | URL) => {
			if (String(input).includes('20260826-200847')) return new Response('', { status: 500 });
			return fetchFixture(input);
		}) as unknown as typeof fetch;

		const result = await loadRepository(github({ listers: [fakeLister()], fetchImpl: flaky }), {
			store
		});
		expect(result.tasks).toHaveLength(78);
		expect(result.skipped).toEqual([{ id: '20260826-200847', reason: 'Could not be read' }]);
	});

	it('skips folders whose name is not a task id', async () => {
		const listed = fakeLister();
		const withJunk = async (): Promise<Listing> => {
			const listing = await listed();
			return { ...listing, entries: [...listing.entries, { path: 'tasks/notes/TASK.md' }] };
		};
		const result = await loadRepository(fixture(withJunk), { store });
		expect(result.skipped).toEqual([{ id: 'notes', reason: 'Folder name is not a task id' }]);
	});

	it('works when the repository has no tags file', async () => {
		const listed = fakeLister();
		const noTags = async (): Promise<Listing> => {
			const listing = await listed();
			return { ...listing, entries: listing.entries.filter((e) => e.path !== 'tasks/tags') };
		};
		const result = await loadRepository(fixture(noTags), { store });
		expect(result.tags.descriptions.size).toBe(0);
	});
});

describe('caching', () => {
	it('serves a revisit from store, spending no quota at all', async () => {
		const lister = vi.fn(fakeLister());
		const source = fixture(lister);

		const first = await loadRepository(source, { store });
		expect(first.fromCache).toBe(false);

		const second = await loadRepository(source, { store });
		expect(second.fromCache).toBe(true);
		expect(second.tasks).toHaveLength(79);
		// The listing is the only rate-limited call; it must not happen twice.
		expect(lister).toHaveBeenCalledTimes(1);
	});

	it('refetches when the reader asks for a refresh', async () => {
		const lister = vi.fn(fakeLister());
		const source = fixture(lister);

		await loadRepository(source, { store });
		const refreshed = await loadRepository(source, {
			store,
			refresh: true
		});
		expect(refreshed.fromCache).toBe(false);
		expect(lister).toHaveBeenCalledTimes(2);
	});

	it('reports when the cached view was fetched, so the UI can show its age', async () => {
		await loadRepository(fixture(), {
			store,
			now: () => 1_000
		});
		const cached = await loadRepository(fixture(), { store });
		expect(cached.storedAt).toBe(1_000);
	});

	it('restores dates across the cache, which JSON cannot carry', async () => {
		await loadRepository(fixture(), { store });
		const cached = await loadRepository(fixture(), { store });
		const earliest = cached.tasks.reduce((a, b) => (a.id < b.id ? a : b));
		expect(earliest.created).toBeInstanceOf(Date);
		expect(earliest.id).toBe('20251205-071347');
	});

	it('restores the tag descriptions, which are a Map', async () => {
		await loadRepository(fixture(), { store });
		const cached = await loadRepository(fixture(), { store });
		expect(cached.tags.descriptions.get('release')).toBe('planned for the next release');
	});

	it('works with no storage at all, as in a private window', async () => {
		const result = await loadRepository(fixture(), { store: memoryStore() });
		expect(result.tasks).toHaveLength(79);
		expect(result.fromCache).toBe(false);
	});
});

describe('what the cache keeps', () => {
	it('returns the bodies the caller just paid for', async () => {
		const result = await loadRepository(fixture(), { store });
		expect(result.tasks.every((task) => typeof task.description === 'string')).toBe(true);
	});

	it('stores metadata only, dropping the descriptions', async () => {
		await loadRepository(fixture(), { store });
		const cached = await loadRepository(fixture(), { store });
		expect(cached.fromCache).toBe(true);
		expect(cached.tasks.every((task) => task.description === undefined)).toBe(true);
	});

	it('keeps the references, so the graph survives without the prose', async () => {
		await loadRepository(fixture(), { store });
		const cached = await loadRepository(fixture(), { store });
		const hub = cached.tasks.find((task) => task.id === '20260826-200847');
		expect(hub?.references).toContain('20260826-152351');
		expect(cached.tasks.filter((task) => task.references.length > 0).length).toBeGreaterThan(10);
	});

	it('re-reads one body on demand for the detail view', async () => {
		const { loadTaskDescription } = await import('./load.ts');
		const body = await loadTaskDescription(fixture(), '20260826-200847');
		expect(body).toContain('Cephon wanted to kanban');
	});

	it('returns null when a body cannot be read', async () => {
		const { loadTaskDescription } = await import('./load.ts');
		expect(await loadTaskDescription(fixture(), 'nope')).toBeNull();
	});
});

/**
 * A repository of a few task files that can be rewritten between readings,
 * which the 79-task fixture cannot be, being a fixture.
 */
function mutable(files: Record<string, string>) {
	const lister = async (): Promise<Listing> => ({
		entries: Object.keys(files).map((id) => ({ path: `tasks/${id}/TASK.md`, size: 1 })),
		branch: 'HEAD'
	});
	const fetchImpl = (async (input: RequestInfo | URL) => {
		const match = /tasks\/([^/]+)\/TASK\.md$/.exec(String(input));
		return match && files[match[1]]
			? new Response(files[match[1]], { status: 200 })
			: new Response('not found', { status: 404 });
	}) as unknown as typeof fetch;
	return { lister, fetchImpl };
}

const file = (priority: number, tags: string, status = 'OPEN') =>
	`# a task\n\n- STATUS: ${status}\n- PRIORITY: ${priority}\n- TAGS: ${tags}\n`;

/**
 * Which reading a new one is compared with is the caller's to say: it has that
 * reading on screen, whatever the source, and a folder has no cache to look it
 * up in. What the loader owes is keeping the comparison with the reading.
 */
describe('the reading a new one replaces', () => {
	const a = '20260101-000001';
	const b = '20260202-000002';
	const before = (priority: number, at = 1_000): Snapshot => ({
		at,
		tasks: [{ id: a, closed: false, priority, tags: ['ui'] }]
	});

	it('has nothing to compare with when given nothing, as on a first visit', async () => {
		const { lister, fetchImpl } = mutable({ [a]: file(90, 'ui') });
		const first = await loadRepository(github({ listers: [lister], fetchImpl }), { store });
		expect(first.previous).toBeNull();
	});

	it('is compared with what was on screen, which moved', async () => {
		const { lister, fetchImpl } = mutable({ [a]: file(90, 'ui', 'CLOSED'), [b]: file(50, '') });
		const refreshed = await loadRepository(github({ listers: [lister], fetchImpl }), {
			store,
			refresh: true,
			replaces: { shown: before(90), previous: null },
			now: () => 2_000
		});

		expect(refreshed.previous).toEqual(before(90));
		expect(refreshed.storedAt).toBe(2_000);
	});

	it('keeps the comparison standing when it moved nothing, rather than announce nothing', async () => {
		// A followed folder takes many such readings (the focus coming back, an
		// editor's swap file, a save that only rewrote prose), and each would
		// otherwise wipe the badges of the last real change.
		const { lister, fetchImpl } = mutable({ [a]: file(110, 'ui') });
		const again = await loadRepository(github({ listers: [lister], fetchImpl }), {
			store,
			refresh: true,
			replaces: { shown: before(110, 2_000), previous: before(90) }
		});
		expect(again.previous).toEqual(before(90));
	});

	it('still carries it on the next visit, so the news survives a reload', async () => {
		const { lister, fetchImpl } = mutable({ [a]: file(110, 'ui') });
		const source = github({ listers: [lister], fetchImpl });

		await loadRepository(source, {
			store,
			refresh: true,
			replaces: { shown: before(90), previous: null }
		});

		const revisited = await loadRepository(source, { store });
		expect(revisited.fromCache).toBe(true);
		expect(revisited.previous?.tasks[0].priority).toBe(90);
	});

	it('does not look for it in the cache, where another tab may have stored one', async () => {
		const files = { [a]: file(90, 'ui') };
		const { lister, fetchImpl } = mutable(files);
		const source = github({ listers: [lister], fetchImpl });

		await loadRepository(source, { store });
		files[a] = file(110, 'ui');
		const refreshed = await loadRepository(source, { store, refresh: true });
		expect(refreshed.previous).toBeNull();
	});
});

/** A file as the directory input reports it. */
function dropped(path: string, text: string): File {
	const file = new File([text], path.split('/').pop()!);
	Object.defineProperty(file, 'webkitRelativePath', { value: `my-project/${path}` });
	return file;
}

describe('a folder on this machine', () => {
	const open = (files: File[]) => {
		const folder = fromFileList(files);
		if (folder) openFolder(folder);
		return localKind.open(localRef());
	};

	const task = (id: string, priority: number, status = 'OPEN') =>
		dropped(
			`tasks/${id}/TASK.md`,
			`# ${id}\n\n- STATUS: ${status}\n- PRIORITY: ${priority}\n- TAGS: ui\n`
		);

	afterEach(() => closeFolder());

	it('reads the tasks the folder holds', async () => {
		const source = open([task('20260101-000001', 90), task('20260101-000002', 50, 'CLOSED')]);
		const result = await loadRepository(source, { store });
		expect(result.tasks.map((one) => one.id)).toEqual(['20260101-000001', '20260101-000002']);
		expect(result.label).toBe('my-project');
	});

	it('is never served from the cache, nor written to it', async () => {
		// Reading the folder is free and a stored copy of a folder someone is
		// editing would be wrong before it was written.
		const source = open([task('20260101-000001', 90)]);
		const first = await loadRepository(source, { store });
		expect(first.fromCache).toBe(false);
		expect(await store.list()).toEqual([]);

		const second = await loadRepository(open([task('20260101-000001', 110)]), { store });
		expect(second.fromCache).toBe(false);
		expect(second.tasks[0].priority).toBe(110);
	});

	it('loads an id that is no real date, as `tatr ls` does', async () => {
		// The CLI checks an id's shape and never its date; the corpus spec compares
		// such tasks with its output field by field. What is the loader's is letting
		// the folders through.
		const ids = ['20260101-120000', '20260231-000000', '20261399-999999', '00000000-000000'];
		const result = await loadRepository(open(ids.map((id) => task(id, 50))), { store });
		expect(result.skipped).toEqual([]);
		expect(result.tasks.map((one) => one.id).sort()).toEqual(ids.toSorted());
		expect(result.tasks.find((one) => one.id === '20260231-000000')?.created).toBeNull();
	});

	it('reads the tag descriptions, which are a file like any other', async () => {
		const source = open([task('20260101-000001', 90), dropped('tasks/tags', 'ui , screens\n')]);
		const result = await loadRepository(source, { store });
		expect(result.tags.descriptions.get('ui')).toBe('screens');
	});

	it('names the checked-out branch, or says it is a working tree', async () => {
		const withHead = open([
			task('20260101-000001', 90),
			dropped('.git/HEAD', 'ref: refs/heads/wip\n')
		]);
		expect((await loadRepository(withHead, { store })).branch).toBe('wip');
		expect((await loadRepository(open([task('20260101-000001', 90)]), { store })).branch).toBe(
			'working tree'
		);
	});

	it('reports a folder that is not a tatr repository as one, not as none', async () => {
		// It was opened; it simply holds no tasks, which is what the reader has to
		// be told: the same thing a repository without the folder is told.
		const source = open([dropped('src/app.css', 'body{}'), dropped('README.md', '# a project\n')]);
		await expect(loadRepository(source, { store })).rejects.toThrow(NoTasksFolderError);
	});

	it('says so when there is no folder open at all, as after a reload', async () => {
		closeFolder();
		await expect(loadRepository(localKind.open(localRef()), { store })).rejects.toThrow(
			NoSourceError
		);
	});
});
