import { afterEach, describe, expect, it } from 'vitest';
import { describeAge, RepositoryState } from './repository.svelte.ts';
import { snapshot } from '../tatr/changes.ts';
import { localRef } from '../repo/ref.ts';
import { fromFileList } from '../sources/local/folder.ts';
import { closeFolder, openFolder } from '../sources/local/kind.ts';
import { readTask, type Task } from '../tatr/task.ts';

/**
 * The wording comes from `Intl`, so what is worth pinning here are the
 * thresholds and the rounding: `Intl` formats a number and a unit, it does not
 * pick them, and "just now" is not a unit it knows.
 */

const NOW = 1_000_000_000;
const ago = (ms: number) => describeAge(NOW - ms, NOW);

describe('describeAge', () => {
	it.each([
		[0, 'just now'],
		[30_000, 'just now'],
		[60_000, '1 minute ago'],
		[12 * 60_000, '12 minutes ago'],
		[60 * 60_000, '1 hour ago'],
		[5 * 60 * 60_000, '5 hours ago'],
		[26 * 60 * 60_000, '1 day ago'],
		[3 * 24 * 60 * 60_000, '3 days ago']
	])('renders %i ms as %o', (elapsed, expected) => {
		expect(ago(elapsed)).toBe(expected);
	});

	it('does not go negative when the clock moves backwards', () => {
		expect(describeAge(NOW + 10_000, NOW)).toBe('just now');
	});
});

const make = (id: string, priority: number, closed = false): Task =>
	readTask(id, `# t\n\n- STATUS: ${closed ? 'CLOSED' : 'OPEN'}\n- PRIORITY: ${priority}\n`)!;

/** A state holding one reading and, optionally, the one before it. */
const reading = (tasks: Task[], previous: Task[] | null, when = 1_000) => {
	const repo = new RepositoryState();
	repo.tasks = tasks;
	repo.previous = previous && snapshot(previous, when);
	return repo;
};

describe('what moved since the last reading', () => {
	const open = make('20260101-000001', 90);

	it('is null with nothing behind it, as on a first visit', () => {
		expect(reading([open], null).changes).toBeNull();
	});

	it('is null when the repository did not move, rather than an empty result', () => {
		// One thing for a view to test, and no way to announce nothing.
		expect(reading([open], [open]).changes).toBeNull();
	});

	it('reports what moved, against the time it is comparing with', () => {
		const changes = reading([make('20260101-000001', 90, true)], [open], 5_000).changes;
		expect(changes?.total).toBe(1);
		expect(changes?.since).toBe(5_000);
		expect(changes?.moved.get('20260101-000001')).toEqual(['closed']);
	});
});

/**
 * Readings of a real source: a folder on this machine, which can be rewritten
 * between two of them and whose grant can be taken back, as every reload does.
 * No mock stands in for `loadRepository`, the point being what the state does
 * with what the loader answers, and a source that can genuinely answer it is
 * already here.
 */
const file = (path: string, text: string) => {
	const one = new File([text], path.split('/').pop()!);
	Object.defineProperty(one, 'webkitRelativePath', { value: `my-project/${path}` });
	return one;
};

const task = (id: string, priority: number) =>
	file(`tasks/${id}/TASK.md`, `# ${id}\n\n- STATUS: OPEN\n- PRIORITY: ${priority}\n`);

/** Opens the folder, holding one task at that priority, as the picker would. */
const opened = (priority = 90) => {
	const folder = fromFileList([task('20260101-000001', priority)]);
	if (folder) openFolder(folder);
	return localRef();
};

describe('a refresh', () => {
	afterEach(() => closeFolder());

	it('keeps the reading on screen while it runs', async () => {
		// Going back to `listing` unmounted every view, which render a reading
		// only once it is ready.
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);

		const pending = repo.refresh();
		expect(repo.phase).toBe('ready');
		expect(repo.refreshing).toBe(true);
		expect(repo.tasks).toHaveLength(1);

		await pending;
		expect(repo.refreshing).toBe(false);
	});

	it('compares with the reading on screen, which a folder has too', async () => {
		const repo = new RepositoryState();
		const ref = opened(90);
		await repo.load(ref);

		opened(110);
		await repo.refresh();

		expect(repo.changes?.moved.get('20260101-000001')).toEqual(['repriorised']);
	});

	it('compares with the last reading, not the first', async () => {
		const repo = new RepositoryState();
		const ref = opened(90);
		await repo.load(ref);
		opened(100);
		await repo.refresh();
		opened(110);
		await repo.refresh();

		expect(repo.previous?.tasks[0].priority).toBe(100);
	});

	it('announces nothing when nothing moved', async () => {
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);
		await repo.refresh();
		expect(repo.changes).toBeNull();
	});

	it('reads the source the reading came from, where a new reading opens its own', async () => {
		// The instance is what will hold a subscription or a permission, so it has
		// to be the same one from one refresh to the next.
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);
		const first = repo.source;

		await repo.refresh();
		expect(repo.source).toBe(first);

		await repo.load(ref);
		expect(repo.source).not.toBe(first);
		expect(repo.changes).toBeNull();
	});
});

describe('a reference no source claims', () => {
	it('fails as a host that is not served', async () => {
		const repo = new RepositoryState();
		await repo.load({ host: 'intranet', owner: 'team', name: 'tasks' });
		expect(repo.phase).toBe('failed');
		expect(repo.failure?.kind).toBe('unsupported-host');
		expect(repo.source).toBeNull();
	});
});

describe('a refresh that fails', () => {
	afterEach(() => closeFolder());

	it('keeps the reading on screen and says only that it was not renewed', async () => {
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);
		expect(repo.phase).toBe('ready');

		// The browser takes a folder's grant back on a reload; a spent API budget
		// arrives at the same place from the other source.
		closeFolder();
		await repo.refresh();

		expect(repo.phase).toBe('ready');
		expect(repo.tasks.map((one) => one.id)).toEqual(['20260101-000001']);
		expect(repo.refreshFailure?.kind).toBe('no-source');
		expect(repo.failure).toBeNull();
	});

	it('is fatal when there is no reading to keep', async () => {
		const repo = new RepositoryState();
		await repo.load(localRef());
		await repo.refresh();
		expect(repo.phase).toBe('failed');
		expect(repo.failure?.kind).toBe('no-source');
		expect(repo.refreshFailure).toBeNull();
	});

	it('is tried again from the source already opened, `load` being the one that opens', async () => {
		const repo = new RepositoryState();
		await repo.load(localRef());
		const first = repo.source;
		expect(repo.phase).toBe('failed');

		opened();
		await repo.refresh();
		expect(repo.phase).toBe('ready');
		expect(repo.source).toBe(first);
	});

	it('leaves the comparison with the reading it belongs to', async () => {
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);
		repo.previous = snapshot([make('20260101-000001', 50)], 5_000);

		closeFolder();
		await repo.refresh();

		// Same tasks on screen, so the badges that explain them stay too.
		expect(repo.changes?.total).toBe(1);
	});

	it('is cleared by the refresh that works', async () => {
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);
		closeFolder();
		await repo.refresh();
		expect(repo.refreshFailure).not.toBeNull();

		opened();
		await repo.refresh();
		expect(repo.refreshFailure).toBeNull();
		expect(repo.phase).toBe('ready');
	});
});
