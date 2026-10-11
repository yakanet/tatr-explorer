import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import rawTasks from '#tests/fixtures/tsoding-tatr-raw.json' with { type: 'json' };
import { fileList } from '#tests/support/fake-directory.ts';
import { memoryStore } from './store.ts';
import { loadRepository } from './load.ts';
import type { Cached, Rereadable } from './capabilities.ts';
import { fromFileList } from './local/folder.ts';
import { closeFolder, LocalFolderSource, openFolder } from './local/source.ts';
import type { Snapshot } from '../tatr/changes.ts';
import type { Listing, Source } from './contract.ts';

const sources = rawTasks as Record<string, string>;

/** The path of a task's file, by its id. */
const at = (id: string) => `tasks/${id}/TASK.md`;

/** The fixture's 79 tasks and a tags file, as the repository holds them. */
const TREE: Readonly<Record<string, string>> = {
	...Object.fromEntries(Object.entries(sources).map(([id, text]) => [at(id), text])),
	'tasks/tags': 'bug , unintended behavior\nrelease , planned for the next release\n',
	'README.md': '# tatr\n'
};

/**
 * A source over `tree`: what the loader does is the question here, whichever
 * source it reads, so this is the least a source can be while cached and read
 * again on demand. It counts its listings, the one call a forge pays for.
 */
class Holding implements Source, Cached, Rereadable {
	readonly label = 'tsoding/tatr';
	readonly cacheKey = 'holding/tsoding/tatr';
	readonly concurrency = 12;
	readonly cost = { listing: 'nothing', files: 'Nothing either.' };
	listings = 0;
	readonly #tree: Readonly<Record<string, string>>;

	constructor(tree: Readonly<Record<string, string>> = TREE) {
		this.#tree = tree;
	}

	async list(): Promise<Listing> {
		this.listings += 1;
		const entries = Object.entries(this.#tree).map(([path, text]) => ({ path, size: text.length }));
		return { entries, branch: 'HEAD' };
	}

	async read(path: string): Promise<string | null> {
		if (!Object.hasOwn(this.#tree, path)) return null;
		return this.#tree[path];
	}

	assetUrl(path: string): string {
		return `https://example.com/${path}`;
	}

	async reread(): Promise<void> {}
}

let store = memoryStore();

beforeEach(() => {
	store = memoryStore();
});

describe('loadRepository', () => {
	it('reads every task in the repository', async () => {
		const result = await loadRepository(new Holding(), { store });
		expect(result.tasks).toHaveLength(79);
		expect(result.tasks.filter((task) => !task.closed)).toHaveLength(33);
		expect(result.skipped).toEqual([]);
	});

	it('reads the tag descriptions when the file is listed', async () => {
		const result = await loadRepository(new Holding(), { store });
		expect(result.tags.descriptions.get('release')).toBe('planned for the next release');
	});

	it('reports progress as files arrive', async () => {
		const onProgress = vi.fn();
		await loadRepository(new Holding(), {
			store,
			onProgress
		});
		expect(onProgress).toHaveBeenCalledTimes(79);
		expect(onProgress).toHaveBeenLastCalledWith(79, 79);
	});

	it('honours the concurrency limit', async () => {
		let inFlight = 0;
		let peak = 0;
		const slow = new (class extends Holding {
			override async read(path: string) {
				peak = Math.max(peak, ++inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight -= 1;
				return super.read(path);
			}
		})();

		await loadRepository(slow, { store, concurrency: 4 });
		expect(peak).toBeLessThanOrEqual(4);
	});

	it('refuses a repository with no tasks folder', async () => {
		const bare = new Holding({ 'README.md': '# not tasks\n' });
		await expect(loadRepository(bare, { store })).rejects.toMatchObject({
			failure: 'no-tasks-folder'
		});
	});

	it('lists unreadable tasks instead of dropping them', async () => {
		const flaky = new (class extends Holding {
			override async read(path: string) {
				if (path === at('20260826-200847')) return null;
				return super.read(path);
			}
		})();

		const result = await loadRepository(flaky, { store });
		expect(result.tasks).toHaveLength(78);
		expect(result.skipped).toEqual([{ id: '20260826-200847', reason: 'Could not be read' }]);
	});

	it('skips folders whose name is not a task id', async () => {
		const withJunk = new Holding({ ...TREE, 'tasks/notes/TASK.md': '# notes\n' });
		const result = await loadRepository(withJunk, { store });
		expect(result.skipped).toEqual([{ id: 'notes', reason: 'Folder name is not a task id' }]);
	});

	it('works when the repository has no tags file', async () => {
		const noTags = Object.entries(TREE).filter(([path]) => path !== 'tasks/tags');
		const result = await loadRepository(new Holding(Object.fromEntries(noTags)), { store });
		expect(result.tags.descriptions.size).toBe(0);
	});
});

describe('caching', () => {
	it('serves a revisit from store, spending no quota at all', async () => {
		const source = new Holding();

		const first = await loadRepository(source, { store });
		expect(first.fromCache).toBe(false);

		const second = await loadRepository(source, { store });
		expect(second.fromCache).toBe(true);
		expect(second.tasks).toHaveLength(79);
		// The listing is the only rate-limited call; it must not happen twice.
		expect(source.listings).toBe(1);
	});

	it('refetches when the reader asks for a refresh', async () => {
		const source = new Holding();

		await loadRepository(source, { store });
		const refreshed = await loadRepository(source, {
			store,
			refresh: true
		});
		expect(refreshed.fromCache).toBe(false);
		expect(source.listings).toBe(2);
	});

	it('reports when the cached view was fetched, so the UI can show its age', async () => {
		await loadRepository(new Holding(), {
			store,
			now: () => 1_000
		});
		const cached = await loadRepository(new Holding(), { store });
		expect(cached.storedAt).toBe(1_000);
	});

	it('restores dates across the cache, which JSON cannot carry', async () => {
		await loadRepository(new Holding(), { store });
		const cached = await loadRepository(new Holding(), { store });
		const earliest = cached.tasks.reduce((a, b) => (a.id < b.id ? a : b));
		expect(earliest.created).toBeInstanceOf(Date);
		expect(earliest.id).toBe('20251205-071347');
	});

	it('restores the tag descriptions, which are a Map', async () => {
		await loadRepository(new Holding(), { store });
		const cached = await loadRepository(new Holding(), { store });
		expect(cached.tags.descriptions.get('release')).toBe('planned for the next release');
	});

	it('works with no storage at all, as in a private window', async () => {
		const result = await loadRepository(new Holding(), { store: memoryStore() });
		expect(result.tasks).toHaveLength(79);
		expect(result.fromCache).toBe(false);
	});
});

describe('what the cache keeps', () => {
	it('returns the bodies the caller just paid for', async () => {
		const result = await loadRepository(new Holding(), { store });
		expect(result.tasks.every((task) => typeof task.description === 'string')).toBe(true);
	});

	it('stores metadata only, dropping the descriptions', async () => {
		await loadRepository(new Holding(), { store });
		const cached = await loadRepository(new Holding(), { store });
		expect(cached.fromCache).toBe(true);
		expect(cached.tasks.every((task) => task.description === undefined)).toBe(true);
	});

	it('keeps the references, so the graph survives without the prose', async () => {
		await loadRepository(new Holding(), { store });
		const cached = await loadRepository(new Holding(), { store });
		const hub = cached.tasks.find((task) => task.id === '20260826-200847');
		expect(hub?.references).toContain('20260826-152351');
		expect(cached.tasks.filter((task) => task.references.length > 0).length).toBeGreaterThan(10);
	});

	it('re-reads one body on demand for the detail view', async () => {
		const { loadTaskDescription } = await import('./load.ts');
		const body = await loadTaskDescription(new Holding(), '20260826-200847');
		expect(body).toContain('Cephon wanted to kanban');
	});

	it('returns null when a body cannot be read', async () => {
		const { loadTaskDescription } = await import('./load.ts');
		expect(await loadTaskDescription(new Holding(), 'nope')).toBeNull();
	});
});

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
		const first = await loadRepository(new Holding({ [at(a)]: file(90, 'ui') }), { store });
		expect(first.previous).toBeNull();
	});

	it('is compared with what was on screen, which moved', async () => {
		const refreshed = await loadRepository(
			new Holding({ [at(a)]: file(90, 'ui', 'CLOSED'), [at(b)]: file(50, '') }),
			{
				store,
				refresh: true,
				replaces: { shown: before(90), previous: null },
				now: () => 2_000
			}
		);

		expect(refreshed.previous).toEqual(before(90));
		expect(refreshed.storedAt).toBe(2_000);
	});

	it('keeps the comparison standing when it moved nothing, rather than announce nothing', async () => {
		// A followed folder takes many such readings (the focus coming back, an
		// editor's swap file, a save that only rewrote prose), and each would
		// otherwise wipe the badges of the last real change.
		const again = await loadRepository(new Holding({ [at(a)]: file(110, 'ui') }), {
			store,
			refresh: true,
			replaces: { shown: before(110, 2_000), previous: before(90) }
		});
		expect(again.previous).toEqual(before(90));
	});

	it('still carries it on the next visit, so the news survives a reload', async () => {
		const source = new Holding({ [at(a)]: file(110, 'ui') });

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
		const tree = { [at(a)]: file(90, 'ui') };
		const source = new Holding(tree);

		await loadRepository(source, { store });
		tree[at(a)] = file(110, 'ui');
		const refreshed = await loadRepository(source, { store, refresh: true });
		expect(refreshed.previous).toBeNull();
	});
});

/** A file as the directory input reports it. */
function dropped(path: string, text: string): File {
	return fileList('my-project', { [path]: text })[0];
}

describe('a folder on this machine', () => {
	const open = (files: File[]) => {
		const folder = fromFileList(files);
		if (folder) openFolder(folder);
		return LocalFolderSource.open();
	};

	const task = (id: string, priority: number, status = 'OPEN') =>
		dropped(at(id), `# ${id}\n\n- STATUS: ${status}\n- PRIORITY: ${priority}\n- TAGS: ui\n`);

	afterEach(() => closeFolder());

	it('reads the tasks the folder holds', async () => {
		const source = open([task('20260101-000001', 90), task('20260101-000002', 50, 'CLOSED')]);
		const result = await loadRepository(source, { store });
		expect(result.tasks.map((one) => one.id)).toEqual(['20260101-000001', '20260101-000002']);
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
		await expect(loadRepository(source, { store })).rejects.toMatchObject({
			failure: 'no-tasks-folder'
		});
	});

	it('says so when there is no folder open at all, as after a reload', async () => {
		closeFolder();
		await expect(loadRepository(LocalFolderSource.open(), { store })).rejects.toMatchObject({
			failure: 'no-source'
		});
	});
});
