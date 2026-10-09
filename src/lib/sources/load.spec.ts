import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import rawTasks from '../../../tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { parseRepoPath } from '../repo/ref.ts';
import { memoryStore } from './store.ts';
import { NoTasksFolderError, loadRepository } from './load.ts';
import { NoSourceError } from './source.ts';
import { githubKind } from './github/kind.ts';
import { fromFileList } from './local/folder.ts';
import { closeFolder, openFolder } from './local/kind.ts';
import { compareById, compareByPriority } from '../tatr/task.ts';
import { localRef } from '../repo/ref.ts';
import { ListingError, type Listing, type OpenOptions } from './source.ts';

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
	const list = (listers: OpenOptions['listers']) => githubKind.open(ref, { listers }).list();

	// A listing no longer says who produced it, so the question is put to the
	// listers themselves — which is the stronger form of it anyway: that the
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
		const result = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		expect(result.tasks).toHaveLength(79);
		expect(result.tasks.filter((task) => !task.closed)).toHaveLength(33);
		expect(result.skipped).toEqual([]);
	});

	it('reads the tag descriptions when the file is listed', async () => {
		const result = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		expect(result.tags.descriptions.get('release')).toBe('planned for the next release');
	});

	it('reports progress as files arrive', async () => {
		const onProgress = vi.fn();
		await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
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

		await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: counting,
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
		await expect(
			loadRepository(ref, { listers: [bare], fetchImpl: fetchFixture, store })
		).rejects.toThrow(NoTasksFolderError);
	});

	it('lists unreadable tasks instead of dropping them', async () => {
		const flaky = (async (input: RequestInfo | URL) => {
			if (String(input).includes('20260826-200847')) return new Response('', { status: 500 });
			return fetchFixture(input);
		}) as unknown as typeof fetch;

		const result = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: flaky,
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
		const result = await loadRepository(ref, {
			listers: [withJunk],
			fetchImpl: fetchFixture,
			store
		});
		expect(result.skipped).toEqual([{ id: 'notes', reason: 'Folder name is not a task id' }]);
	});

	it('works when the repository has no tags file', async () => {
		const listed = fakeLister();
		const noTags = async (): Promise<Listing> => {
			const listing = await listed();
			return { ...listing, entries: listing.entries.filter((e) => e.path !== 'tasks/tags') };
		};
		const result = await loadRepository(ref, {
			listers: [noTags],
			fetchImpl: fetchFixture,
			store
		});
		expect(result.tags.descriptions.size).toBe(0);
	});
});

describe('caching', () => {
	it('serves a revisit from store, spending no quota at all', async () => {
		const lister = vi.fn(fakeLister());

		const first = await loadRepository(ref, {
			listers: [lister],
			fetchImpl: fetchFixture,
			store
		});
		expect(first.fromCache).toBe(false);

		const second = await loadRepository(ref, {
			listers: [lister],
			fetchImpl: fetchFixture,
			store
		});
		expect(second.fromCache).toBe(true);
		expect(second.tasks).toHaveLength(79);
		// The listing is the only rate-limited call; it must not happen twice.
		expect(lister).toHaveBeenCalledTimes(1);
	});

	it('refetches when the reader asks for a refresh', async () => {
		const lister = vi.fn(fakeLister());

		await loadRepository(ref, { listers: [lister], fetchImpl: fetchFixture, store });
		const refreshed = await loadRepository(ref, {
			listers: [lister],
			fetchImpl: fetchFixture,
			store,
			refresh: true
		});
		expect(refreshed.fromCache).toBe(false);
		expect(lister).toHaveBeenCalledTimes(2);
	});

	it('reports when the cached view was fetched, so the UI can show its age', async () => {
		await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store,
			now: () => 1_000
		});
		const cached = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		expect(cached.storedAt).toBe(1_000);
	});

	it('restores dates across the cache, which JSON cannot carry', async () => {
		await loadRepository(ref, { listers: [fakeLister()], fetchImpl: fetchFixture, store });
		const cached = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		const earliest = cached.tasks.reduce((a, b) => (a.id < b.id ? a : b));
		expect(earliest.created).toBeInstanceOf(Date);
		expect(earliest.id).toBe('20251205-071347');
	});

	it('restores the tag descriptions, which are a Map', async () => {
		await loadRepository(ref, { listers: [fakeLister()], fetchImpl: fetchFixture, store });
		const cached = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		expect(cached.tags.descriptions.get('release')).toBe('planned for the next release');
	});

	it('works with no storage at all, as in a private window', async () => {
		const result = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store: memoryStore()
		});
		expect(result.tasks).toHaveLength(79);
		expect(result.fromCache).toBe(false);
	});
});

describe('what the cache keeps', () => {
	it('returns the bodies the caller just paid for', async () => {
		const result = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		expect(result.tasks.every((task) => typeof task.description === 'string')).toBe(true);
	});

	it('stores metadata only, dropping the descriptions', async () => {
		await loadRepository(ref, { listers: [fakeLister()], fetchImpl: fetchFixture, store });
		const cached = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		expect(cached.fromCache).toBe(true);
		expect(cached.tasks.every((task) => task.description === undefined)).toBe(true);
	});

	it('keeps the references, so the graph survives without the prose', async () => {
		await loadRepository(ref, { listers: [fakeLister()], fetchImpl: fetchFixture, store });
		const cached = await loadRepository(ref, {
			listers: [fakeLister()],
			fetchImpl: fetchFixture,
			store
		});
		const hub = cached.tasks.find((task) => task.id === '20260826-200847');
		expect(hub?.references).toContain('20260826-152351');
		expect(cached.tasks.filter((task) => task.references.length > 0).length).toBeGreaterThan(10);
	});

	it('re-reads one body on demand for the detail view', async () => {
		const { loadTaskDescription } = await import('./load.ts');
		const body = await loadTaskDescription(ref, 'HEAD', '20260826-200847', {
			fetchImpl: fetchFixture
		});
		expect(body).toContain('Cephon wanted to kanban');
	});

	it('returns null when a body cannot be read', async () => {
		const { loadTaskDescription } = await import('./load.ts');
		expect(await loadTaskDescription(ref, 'HEAD', 'nope', { fetchImpl: fetchFixture })).toBeNull();
	});
});

/**
 * A repository of a few task files that can be rewritten between readings —
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

describe('what the reader last saw', () => {
	const a = '20260101-000001';
	const b = '20260202-000002';

	it('has nothing behind a first visit', async () => {
		const { lister, fetchImpl } = mutable({ [a]: file(90, 'ui') });
		const first = await loadRepository(ref, { listers: [lister], fetchImpl, store });
		expect(first.previous).toBeNull();
	});

	it('carries the previous reading through a refresh, with its age', async () => {
		const files = { [a]: file(90, 'ui'), [b]: file(50, '') };
		const { lister, fetchImpl } = mutable(files);
		const options = { listers: [lister], fetchImpl, store };

		await loadRepository(ref, { ...options, now: () => 1_000 });
		files[a] = file(90, 'ui', 'CLOSED');
		const refreshed = await loadRepository(ref, { ...options, refresh: true, now: () => 2_000 });

		expect(refreshed.previous?.at).toBe(1_000);
		expect(refreshed.previous?.tasks).toEqual([
			{ id: a, closed: false, priority: 90, tags: ['ui'] },
			{ id: b, closed: false, priority: 50, tags: [] }
		]);
		expect(refreshed.storedAt).toBe(2_000);
	});

	it('still carries it on the next visit, so the news survives a reload', async () => {
		const files = { [a]: file(90, 'ui') };
		const { lister, fetchImpl } = mutable(files);
		const options = { listers: [lister], fetchImpl, store };

		await loadRepository(ref, { ...options, now: () => 1_000 });
		files[a] = file(110, 'ui');
		await loadRepository(ref, { ...options, refresh: true, now: () => 2_000 });

		const revisited = await loadRepository(ref, options);
		expect(revisited.fromCache).toBe(true);
		expect(revisited.previous?.tasks[0].priority).toBe(90);
	});

	it('replaces it on the next refresh rather than accumulating readings', async () => {
		const files = { [a]: file(90, 'ui') };
		const { lister, fetchImpl } = mutable(files);
		const options = { listers: [lister], fetchImpl, store };

		await loadRepository(ref, { ...options, now: () => 1_000 });
		files[a] = file(100, 'ui');
		await loadRepository(ref, { ...options, refresh: true, now: () => 2_000 });
		files[a] = file(110, 'ui');
		const third = await loadRepository(ref, { ...options, refresh: true, now: () => 3_000 });

		// "Since your last read" is the last one, not the first.
		expect(third.previous?.at).toBe(2_000);
		expect(third.previous?.tasks[0].priority).toBe(100);
	});

	it('says nothing at all when a refresh brought nothing', async () => {
		// The comparison is still taken and stored — it is the reading that moved
		// on — so what a view gets is a snapshot identical to the tasks, which
		// compares to no movement.
		const files = { [a]: file(90, 'ui') };
		const { lister, fetchImpl } = mutable(files);
		const options = { listers: [lister], fetchImpl, store };

		await loadRepository(ref, { ...options, now: () => 1_000 });
		const again = await loadRepository(ref, { ...options, refresh: true, now: () => 2_000 });
		expect(again.previous?.tasks).toEqual([{ id: a, closed: false, priority: 90, tags: ['ui'] }]);
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
		return localRef();
	};

	const task = (id: string, priority: number, status = 'OPEN') =>
		dropped(
			`tasks/${id}/TASK.md`,
			`# ${id}\n\n- STATUS: ${status}\n- PRIORITY: ${priority}\n- TAGS: ui\n`
		);

	afterEach(() => closeFolder());

	it('reads the tasks the folder holds', async () => {
		const ref = open([task('20260101-000001', 90), task('20260101-000002', 50, 'CLOSED')]);
		const result = await loadRepository(ref, { store });
		expect(result.tasks.map((one) => one.id)).toEqual(['20260101-000001', '20260101-000002']);
		expect(result.label).toBe('my-project');
	});

	it('spends no quota and asks no lister, there being nothing to ask', async () => {
		const lister = vi.fn(fakeLister());
		await loadRepository(open([task('20260101-000001', 90)]), { listers: [lister], store });
		expect(lister).not.toHaveBeenCalled();
	});

	it('is never served from the cache, nor written to it', async () => {
		// Reading the folder is free and a stored copy of a folder someone is
		// editing would be wrong before it was written.
		const ref = open([task('20260101-000001', 90)]);
		const first = await loadRepository(ref, { store });
		expect(first.fromCache).toBe(false);
		expect(await store.list()).toEqual([]);

		openFolder(fromFileList([task('20260101-000001', 110)])!);
		const second = await loadRepository(ref, { store });
		expect(second.fromCache).toBe(false);
		expect(second.tasks[0].priority).toBe(110);
	});

	it('lists an id that is no real date, in the order `tatr ls` gives it', async () => {
		// Recorded with the binary built from tatr 9b0d752, over these five folders
		// with these statuses and priorities: `tatr ls` printed the four open ones
		// in this order, `tatr ls -c` the closed one. The CLI checks an id's shape
		// and never its date, so all five are tasks.
		const ref = open([
			task('20260101-120000', 50),
			task('20260231-000000', 50),
			task('20261399-999999', 70),
			task('20260231-000000-x', 50, 'CLOSED'),
			task('00000000-000000', 50)
		]);
		const result = await loadRepository(ref, { store });
		expect(result.skipped).toEqual([]);
		const listed = (closed: boolean) =>
			result.tasks
				.filter((one) => one.closed === closed)
				.toSorted((a, b) => compareByPriority(a, b) || compareById(a, b))
				.map((one) => one.id);
		expect(listed(false)).toEqual([
			'20261399-999999',
			'00000000-000000',
			'20260101-120000',
			'20260231-000000'
		]);
		expect(listed(true)).toEqual(['20260231-000000-x']);
		expect(result.tasks.find((one) => one.id === '20260231-000000')?.created).toBeNull();
	});

	it('reads the tag descriptions, which are a file like any other', async () => {
		const ref = open([task('20260101-000001', 90), dropped('tasks/tags', 'ui , screens\n')]);
		const result = await loadRepository(ref, { store });
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
		// be told — the same thing a repository without the folder is told.
		const ref = open([dropped('src/app.css', 'body{}'), dropped('README.md', '# a project\n')]);
		await expect(loadRepository(ref, { store })).rejects.toThrow(NoTasksFolderError);
	});

	it('says so when there is no folder open at all, as after a reload', async () => {
		closeFolder();
		await expect(loadRepository(localRef(), { store })).rejects.toThrow(NoSourceError);
	});

	it('has nothing to compare against: a folder keeps no previous reading', async () => {
		const result = await loadRepository(open([task('20260101-000001', 90)]), { store });
		expect(result.previous).toBeNull();
	});
});
