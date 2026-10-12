import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { directory, entryTree, fileList } from '#tests/support/fake-directory.ts';
import { makeTask } from '#tests/support/tasks.ts';
import { describeAge, RepositoryState } from './repository.svelte.ts';
import { snapshot } from '../tatr/changes.ts';
import { parseRepoPath } from '../sources/open.ts';
import { fromDirectoryEntry } from '../sources/local/directory-entry.ts';
import { fromDirectoryHandle } from '../sources/local/directory-handle.ts';
import { fromFileList } from '../sources/local/folder.ts';
import { closeFolder, openFolder } from '../sources/local/source.ts';
import { fieldsOf, NEW_TASK, withFields } from '../tatr/task-fields.ts';
import { describedTagsFile, TAGS_FILE } from '../tatr/tags-file.ts';
import { loadTaskFile, withStatus, withTag } from '../tatr/task-file.ts';
import type { Task } from '../tatr/task.ts';

const NOW = 1_000_000_000;
const ago = (ms: number) => describeAge(NOW - ms, NOW);

// The wording is `Intl`'s; these pin the thresholds and the rounding.
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

/** A state holding one reading and, optionally, the one before it. */
const reading = (tasks: Task[], previous: Task[] | null, when = 1_000) => {
	const repo = new RepositoryState();
	repo.tasks = tasks;
	repo.previous = previous && snapshot(previous, when);
	return repo;
};

describe('what moved since the last reading', () => {
	const open = makeTask('20260101-000001', 90);

	it('is null with nothing behind it, as on a first visit', () => {
		expect(reading([open], null).changes).toBeNull();
	});

	it('is null when the repository did not move, rather than an empty result', () => {
		expect(reading([open], [open]).changes).toBeNull();
	});

	it('reports what moved, against the time it is comparing with', () => {
		const changes = reading([makeTask('20260101-000001', 90, [], true)], [open], 5_000).changes;
		expect(changes?.total).toBe(1);
		expect(changes?.since).toBe(5_000);
		expect(changes?.moved.get('20260101-000001')).toEqual(['closed']);
	});
});

/**
 * The tests below read a real folder source instead of mocking
 * `loadRepository`: a folder can be rewritten between two readings, which
 * exercises what the state does with each answer.
 */
const TASK = 'tasks/20260101-000001/TASK.md';
const taskAt = (priority: number, status = 'OPEN') =>
	`# a\n\n- STATUS: ${status}\n- PRIORITY: ${priority}\n`;

/** Opens a folder holding one task at that priority, as a directory input does. */
const opened = (priority = 90) => {
	openFolder(fromFileList(fileList('my-project', { [TASK]: taskAt(priority) }))!);
	return parseRepoPath('local')!;
};

/** The folder's files on disk, rewritten between two readings. */
let disk: Record<string, string> = {};

/**
 * Opens a folder holding `tree` with its directory entry, as a drop does, so a
 * refresh reads what changed on disk since.
 */
const picked = async (tree: Record<string, string> = { [TASK]: taskAt(90) }) => {
	disk = tree;
	const entry = entryTree('my-project', disk);
	openFolder(await fromDirectoryEntry(entry), entry);
	return parseRepoPath('local')!;
};

/** Saves the task at another priority, as an editor would. */
const saved = (priority: number) => {
	disk[TASK] = taskAt(priority);
};

describe('a refresh', () => {
	afterEach(() => closeFolder());

	it('keeps the reading on screen while it runs', async () => {
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
		await repo.load(await picked());

		saved(110);
		await repo.refresh();

		expect(repo.changes?.moved.get('20260101-000001')).toEqual(['repriorised']);
	});

	it('compares with the last reading, not the first', async () => {
		const repo = new RepositoryState();
		await repo.load(await picked());
		saved(100);
		await repo.refresh();
		saved(110);
		await repo.refresh();

		expect(repo.previous?.tasks[0].priority).toBe(100);
	});

	it('leaves the badges of the last change when the next reading moves nothing', async () => {
		const repo = new RepositoryState();
		await repo.load(await picked());
		saved(110);
		await repo.refresh();
		await repo.refresh();

		expect(repo.changes?.moved.get('20260101-000001')).toEqual(['repriorised']);
	});

	it('announces nothing when nothing moved', async () => {
		const repo = new RepositoryState();
		const ref = opened();
		await repo.load(ref);
		await repo.refresh();
		expect(repo.changes).toBeNull();
	});

	it('reads the source the reading came from, where a new reading opens its own', async () => {
		const repo = new RepositoryState();
		await repo.load(opened());
		const first = repo.source;

		await repo.refresh();
		expect(repo.source).toBe(first);

		await repo.load(opened());
		expect(repo.source).not.toBe(first);
		expect(repo.changes).toBeNull();
	});
});

describe('following', () => {
	afterEach(() => {
		closeFolder();
		vi.unstubAllGlobals();
	});

	it('reads a folder again as it changes, and says what moved', async () => {
		// Without an observer, as for a folder dropped on Firefox, window focus
		// triggers the new reading.
		vi.stubGlobal('window', new EventTarget());
		const repo = new RepositoryState();
		await repo.load(await picked());
		const stop = repo.follow();

		disk[TASK] = taskAt(90, 'CLOSED');
		window.dispatchEvent(new Event('focus'));

		await vi.waitFor(() => expect(repo.changes?.moved.get('20260101-000001')).toEqual(['closed']));
		expect(repo.phase).toBe('ready');
		stop?.();
	});

	it('does not follow a folder with no way back to it', async () => {
		const repo = new RepositoryState();
		await repo.load(opened());
		expect(repo.phase).toBe('ready');
		expect(repo.follow()).toBeUndefined();
	});

	it('does not follow before there is a reading', () => {
		expect(new RepositoryState().follow()).toBeUndefined();
	});
});

describe('a reference nothing reads', () => {
	it('fails as a host nothing reads', async () => {
		const repo = new RepositoryState();
		await repo.load(parseRepoPath('gitlab.com/group/project')!);
		expect(repo.phase).toBe('failed');
		expect(repo.failure?.kind).toBe('unsupported-host');
		expect(repo.source).toBeNull();
	});
});

describe('a refresh that fails', () => {
	afterEach(() => closeFolder());

	it('keeps the reading on screen and says only that it was not renewed', async () => {
		const repo = new RepositoryState();
		await repo.load(await picked());
		expect(repo.phase).toBe('ready');

		// Removing the tasks stands in for a spent rate limit on a forge source.
		delete disk[TASK];
		await repo.refresh();

		expect(repo.phase).toBe('ready');
		expect(repo.tasks.map((one) => one.id)).toEqual(['20260101-000001']);
		expect(repo.refreshFailure?.kind).toBe('no-tasks-folder');
		expect(repo.failure).toBeNull();
	});

	it('is fatal when there is no reading to keep', async () => {
		const repo = new RepositoryState();
		await repo.load(parseRepoPath('local')!);
		await repo.refresh();
		expect(repo.phase).toBe('failed');
		expect(repo.failure?.kind).toBe('no-source');
		expect(repo.refreshFailure).toBeNull();
	});

	it('is tried again from the source already opened, `load` being the one that opens', async () => {
		// A folder picked before its first task exists.
		const repo = new RepositoryState();
		await repo.load(await picked({}));
		const first = repo.source;
		expect(repo.phase).toBe('failed');

		saved(90);
		await repo.refresh();
		expect(repo.phase).toBe('ready');
		expect(repo.source).toBe(first);
	});

	it('leaves the comparison with the reading it belongs to', async () => {
		const repo = new RepositoryState();
		await repo.load(await picked());
		repo.previous = snapshot([makeTask('20260101-000001', 50)], 5_000);

		delete disk[TASK];
		await repo.refresh();

		// The same tasks stay on screen, so the badges explaining them stay too.
		expect(repo.changes?.total).toBe(1);
	});

	it('is cleared by the refresh that works', async () => {
		// The tasks vanish briefly, as when checking out a branch without them.
		const repo = new RepositoryState();
		await repo.load(await picked());
		delete disk[TASK];
		await repo.refresh();
		expect(repo.refreshFailure).not.toBeNull();

		saved(90);
		await repo.refresh();
		expect(repo.refreshFailure).toBeNull();
		expect(repo.phase).toBe('ready');
	});
});

/** The extras of a save that describes `tags` in `tasks/tags`, as a sheet's are. */
const describing = (tags: ReadonlyMap<string, string>) => () => [
	{ path: TAGS_FILE, rewrite: (before: string | null) => describedTagsFile(before, tags) }
];

describe('editing a task', () => {
	const ID = '20260101-000001';
	const close = withStatus('CLOSED');
	/** The task at that priority once rewritten, which writes down the TAGS the CLI assumes. */
	const rewritten = (priority: number, status: string) => `${taskAt(priority, status)}- TAGS:\n`;

	afterEach(() => closeFolder());

	/** Opens a folder picked on Chromium, whose reader answers `ask`. */
	const writable = async (ask: () => Promise<PermissionState> = async () => 'granted') => {
		disk = { [TASK]: taskAt(90) };
		const handle = directory('my-project', disk, ask);
		openFolder(await fromDirectoryHandle(handle), handle);
		return parseRepoPath('local')!;
	};

	/** A state reading a folder picked on Chromium, whose reader answers `ask`. */
	const editing = async (ask?: () => Promise<PermissionState>) => {
		const repo = new RepositoryState();
		await repo.load(await writable(ask));
		return repo;
	};

	it('is offered only where the source writes', async () => {
		expect((await editing()).editable).toBe(true);
		const repo = new RepositoryState();
		await repo.load(opened());
		expect(repo.editable).toBe(false);
	});

	it('writes the edit, then shows it as any change found on disk', async () => {
		const repo = await editing();
		expect(await repo.edit(ID, close, 'closed')).toBe(true);

		expect(disk[TASK]).toBe(rewritten(90, 'CLOSED'));
		expect(repo.tasks[0].closed).toBe(true);
		expect(repo.changes?.moved.get(ID)).toEqual(['closed']);
		expect(repo.notice).toEqual({ text: `${ID}: closed.`, failed: false, undoable: true });
	});

	it('edits the file as it is on disk, not as the reading on screen holds it', async () => {
		const repo = await editing();
		saved(110);
		await repo.edit(ID, close, 'closed');
		expect(disk[TASK]).toBe(rewritten(110, 'CLOSED'));
	});

	it('writes nothing when the file already says so', async () => {
		const repo = await editing();
		disk[TASK] = taskAt(90, 'CLOSED');
		await repo.edit(ID, close, 'closed');

		expect(repo.notice).toBeNull();
		expect(repo.tasks[0].closed).toBe(true);
	});

	it('stops offering edits once the reader refuses, without asking again', async () => {
		const ask = vi.fn(async (): Promise<PermissionState> => 'denied');
		const repo = await editing(ask);
		await repo.edit(ID, close, 'closed');
		await repo.edit(ID, close, 'closed');

		expect(repo.editable).toBe(false);
		expect(repo.notice?.failed).toBe(true);
		expect(ask).toHaveBeenCalledTimes(1);
		expect(disk[TASK]).toBe(taskAt(90));
	});

	it('offers edits again on another folder', async () => {
		const repo = await editing(async () => 'denied');
		await repo.edit(ID, close, 'closed');
		await repo.load(await picked());
		expect(repo.notice).toBeNull();

		await repo.load(await writable());
		expect(repo.editable).toBe(true);
	});

	it('says why a write failed, and leaves the reading as it was', async () => {
		const repo = await editing(() => Promise.reject(new DOMException('no click', 'SecurityError')));
		expect(await repo.edit(ID, close, 'closed')).toBe(false);

		expect(repo.notice?.failed).toBe(true);
		expect(repo.notice?.text).toMatch(/click/);
		expect(repo.phase).toBe('ready');
		expect(repo.tasks[0].closed).toBe(false);
		expect(repo.editable).toBe(true);
	});

	it('says so when the task file is gone', async () => {
		const repo = await editing();
		delete disk[TASK];
		await repo.edit(ID, close, 'closed');
		expect(repo.notice?.text).toBe(`${ID} could not be read, so nothing was written.`);
	});

	it('undoes the last edit byte for byte', async () => {
		const repo = await editing();
		const loose = '# a\n\n- STATUS:  OPEN\n- PRIORITY: 90\n';
		disk[TASK] = loose;
		await repo.edit(ID, close, 'closed');
		await repo.undo();

		expect(disk[TASK]).toBe(loose);
		expect(repo.tasks[0].closed).toBe(false);
		expect(repo.notice).toEqual({ text: `${ID}: undone.`, failed: false, undoable: false });
	});

	it('says why an edit refused the file, writing nothing and reading again', async () => {
		const repo = await editing();
		const opened = fieldsOf(loadTaskFile(disk[TASK])!);
		saved(110);

		const done = await repo.edit(ID, withFields(opened, { ...opened, priority: 60 }), 'saved');
		expect(done).toBe(false);
		expect(repo.notice?.text).toBe(
			`${ID}: the priority changed on disk since editing began, so nothing was written.`
		);
		expect(disk[TASK]).toBe(taskAt(110));
		expect(repo.tasks[0].priority).toBe(110);
	});

	it('undoes nothing over a save made since', async () => {
		const repo = await editing();
		await repo.edit(ID, close, 'closed');
		saved(110);
		await repo.undo();

		expect(disk[TASK]).toBe(taskAt(110));
		expect(repo.notice?.failed).toBe(true);
		expect(repo.tasks[0].priority).toBe(110);
	});

	describe('describing the tags new to the repository', () => {
		const described = describing(new Map([['fresh', 'a tag no task had']]));
		const tagged = withTag('fresh');

		it('creates tasks/tags with the save where the repository has none', async () => {
			const repo = await editing();
			expect(await repo.edit(ID, tagged, 'saved', described)).toBe(true);

			expect(disk['tasks/tags']).toBe('fresh , a tag no task had\n');
			expect(repo.tags.descriptions.get('fresh')).toBe('a tag no task had');
			expect(repo.notice).toEqual({ text: `${ID}: saved.`, failed: false, undoable: true });
		});

		it('appends to the tasks/tags there, every line of it kept', async () => {
			const repo = await editing();
			disk['tasks/tags'] = 'ui , screens';
			await repo.edit(ID, tagged, 'saved', described);
			expect(disk['tasks/tags']).toBe('ui , screens\nfresh , a tag no task had\n');
		});

		it('describes them even when the task file already says so', async () => {
			const repo = await editing();
			disk[TASK] = `${taskAt(90)}- TAGS: fresh\n`;
			expect(await repo.edit(ID, tagged, 'saved', described)).toBe(true);
			expect(disk['tasks/tags']).toBe('fresh , a tag no task had\n');
		});

		it('says the save was made but not the description, when tasks/tags cannot be written', async () => {
			const repo = await editing();
			disk['tasks/tags/oops'] = 'a folder where the file belongs';
			// Not done, so that the sheet stays open to try again.
			expect(await repo.edit(ID, tagged, 'saved', described)).toBe(false);

			expect(repo.notice?.failed).toBe(true);
			expect(repo.notice?.text).toMatch(
				new RegExp(`^${ID}: saved\\. tasks/tags was not written: `)
			);
		});
	});

	it('says which file was not written, rather than replace one it did not read', async () => {
		const repo = await editing();
		disk[`tasks/${ID}/shot.png`] = 'there already';
		const onwritten = vi.fn();
		const files = () => [
			{ path: `tasks/${ID}/shot.png`, contents: new Blob(['new']) },
			{ path: `tasks/${ID}/other.png`, contents: new Blob(['other']), onwritten }
		];
		expect(await repo.edit(ID, close, 'closed', files)).toBe(false);

		expect(disk[`tasks/${ID}/shot.png`]).toBe('there already');
		expect(disk[`tasks/${ID}/other.png`]).toBe('other');
		expect(onwritten).toHaveBeenCalledTimes(1);
		expect(repo.notice?.text).toBe(
			`${ID}: closed. tasks/${ID}/shot.png was not written, as a file is there already.`
		);
	});

	it('offers no Undo for a write that left the task file as it was', async () => {
		const repo = await editing();
		await repo.edit(ID, close, 'closed');
		const closed = disk[TASK];
		const file = () => [{ path: `tasks/${ID}/new.png`, contents: new Blob(['png']) }];
		await repo.edit(ID, close, 'closed', file);

		expect(repo.notice?.undoable).toBe(false);
		expect(await repo.undo()).toBe(false);
		expect(disk[TASK]).toBe(closed);
	});

	it('asks again after a question dismissed, and stays editable', async () => {
		const ask = vi
			.fn<() => Promise<PermissionState>>()
			.mockResolvedValueOnce('prompt')
			.mockResolvedValue('granted');
		const repo = await editing(ask);
		expect(await repo.edit(ID, close, 'closed')).toBe(false);
		expect(repo.notice?.text).toMatch(/dismissed/);
		expect(repo.editable).toBe(true);

		expect(await repo.edit(ID, close, 'closed')).toBe(true);
		expect(ask).toHaveBeenCalledTimes(2);
	});

	it('leaves alone a repository opened while an edit waited for its answer', async () => {
		let answer: (state: PermissionState) => void = () => {};
		const repo = await editing(() => new Promise((resolve) => (answer = resolve)));
		const first = disk;
		const waiting = repo.edit(ID, close, 'closed');
		await repo.load(await picked({ [TASK]: taskAt(40) }));
		answer('granted');

		expect(await waiting).toBe(false);
		expect(first[TASK]).toBe(taskAt(90));
		expect(disk[TASK]).toBe(taskAt(40));
		expect(repo.notice).toBeNull();
	});

	describe('creating a task', () => {
		/** The id the clock gives while these run. */
		const CREATED = '20261012-083000';
		const createdPath = `tasks/${CREATED}/TASK.md`;

		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(Date.UTC(2026, 9, 12, 8, 30, 0));
		});
		afterEach(() => vi.useRealTimers());

		it('writes the file `tatr new` writes, under the id of the clock, and reads it', async () => {
			const repo = await editing();
			expect(await repo.create({ ...NEW_TASK, title: 'Created', tags: ['ui'] })).toBe(CREATED);

			expect(disk[createdPath]).toBe(
				'# Created\n\n- STATUS: OPEN\n- PRIORITY: 100\n- TAGS: ui\n\nNo description.\n'
			);
			expect(repo.tasks.map((task) => task.id)).toContain(CREATED);
			expect(repo.notice).toEqual({ text: `${CREATED}: created.`, failed: false, undoable: false });
		});

		it('refuses an id whose folder exists, whatever it holds, as `tatr new` does', async () => {
			const repo = await editing();
			disk[`tasks/${CREATED}/shot.png`] = 'not much of a picture';

			expect(await repo.create(NEW_TASK)).toBeNull();
			expect(repo.notice?.text).toBe(
				`${CREATED} already exists. You are probably creating tasks too fast, or your time is broken.`
			);
			expect(disk[createdPath]).toBeUndefined();
		});

		it('leaves nothing for Undo, which would have no file to write back', async () => {
			const repo = await editing();
			await repo.edit(ID, close, 'closed');
			await repo.create(NEW_TASK);

			expect(await repo.undo()).toBe(false);
			expect(disk[TASK]).toBe(rewritten(90, 'CLOSED'));
		});

		it('describes its new tags in tasks/tags', async () => {
			const repo = await editing();
			const described = describing(new Map([['fresh', 'a tag no task had']]));
			await repo.create({ ...NEW_TASK, tags: ['fresh'] }, described);
			expect(disk['tasks/tags']).toBe('fresh , a tag no task had\n');
		});

		it('writes its images into its folder once the task file has made it', async () => {
			const repo = await editing();
			const image = (id: string) => [{ path: `tasks/${id}/shot.png`, contents: new Blob(['png']) }];
			await repo.create(NEW_TASK, image);
			expect(disk[`tasks/${CREATED}/shot.png`]).toBe('png');
		});

		it('creates nothing once the reader refuses', async () => {
			const repo = await editing(async () => 'denied');
			expect(await repo.create(NEW_TASK)).toBeNull();
			expect(repo.editable).toBe(false);
			expect(disk[createdPath]).toBeUndefined();
		});
	});
});
