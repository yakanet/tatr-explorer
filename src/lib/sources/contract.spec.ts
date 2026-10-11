/**
 * What every source does, asked of every kind over the same tree.
 *
 * `source.ts` says what a source has; this says what it must do with it, which
 * is what the author of a new source most needs to be told, and in a form that
 * fails when they get it wrong. What only one kind does stays in that kind's
 * own spec.
 *
 * Each kind's folder says how its sources are built, in `subjects.ts`, and the
 * table at the end is keyed like the registry: a kind added to `KINDS` and not
 * here does not compile, where a contract each kind had to remember to call
 * would let a new one go unchecked in silence.
 *
 * Only what every source does is asked. A forge cannot tell a missing file's
 * URL from a present one's without a listing, so what `assetUrl` answers for a
 * file that is not there is left to each kind's own spec, and so is the branch
 * a listing names, which a folder reads out of `.git/HEAD` and a forge does not.
 */
import { describe, expect, it } from 'vitest';
import { subjects as github } from './github/subjects.ts';
import { loadRepository } from './load.ts';
import { subjects as local } from './local/subjects.ts';
import type { KINDS } from './open.ts';
import { subjects as served } from './served/subjects.server.ts';
import { ListingError, NoSourceError, type Listing, type Source } from './source.ts';
import { memoryStore } from './store.ts';

/** One of a kind's sources, as the contract builds it. */
export interface Subject {
	/** How the source came to be, which names its tests. */
	name: string;
	/**
	 * A source holding `tree`, paths from the repository root to contents. A
	 * change to `tree` is there for the source to find when it reads again, as
	 * on a repository that moves.
	 */
	holding(tree: Record<string, string>): Promise<Source>;
	/** A source whose listing fails, the way this kind's fails in practice. */
	broken(): Source;
	/** Carries a change to `tree` where the source reads, when that is not `tree` itself. */
	sync?(tree: Record<string, string>): Promise<unknown>;
}

/** A repository every kind can hold: two tasks, an attachment and a tags file. */
const TREE: Readonly<Record<string, string>> = {
	'tasks/20260101-000001/TASK.md':
		'# Open\n\n- STATUS: OPEN\n- PRIORITY: 90\n- TAGS: ui\n\nA body.\n',
	'tasks/20260101-000002/TASK.md': '# Closed\n\n- STATUS: CLOSED\n- PRIORITY: 50\n',
	'tasks/20260101-000002/shot.png': 'not much of a picture',
	'tasks/tags': 'ui , screens\n'
};

/** The paths under `tasks/`, in order: all a folder keeps, and all compared here. */
function underTasks(paths: string[]): string[] {
	return paths.filter((path) => path.startsWith('tasks/')).toSorted();
}

function listedUnderTasks(listing: Listing): string[] {
	return underTasks(listing.entries.map((entry) => entry.path));
}

const TASK_FILES = underTasks(Object.keys(TREE));

/*
 * What a source may do besides listing and reading, asked through these rather
 * than through its members, so that the members can change shape while the
 * tests below stay as they are.
 */

function cacheKeyOf(source: Source): string | null {
	return source.cacheKey;
}

function canBeReadAgain(source: Source): boolean {
	return source.repeatable;
}

async function readAgain(source: Source): Promise<void> {
	await source.refresh?.();
}

function follows(source: Source): boolean {
	return source.follow !== undefined;
}

function pageOf(source: Source, path: string): string | undefined {
	return source.fileUrl?.(path);
}

/** A failure the page has a sentence for, rather than a bare error. */
function isExplained(error: unknown): boolean {
	return error instanceof ListingError || error instanceof NoSourceError;
}

function honoursTheContract(subject: Subject): void {
	describe(`${subject.name}, as a source`, () => {
		const holding = () => subject.holding({ ...TREE });

		it('declares what the loader asks of it', async () => {
			const source = await holding();
			expect(source.label).not.toBe('');
			expect(source.concurrency).toBeGreaterThanOrEqual(1);
			// Null says "never cache this"; an empty key would say it ambiguously.
			expect(cacheKeyOf(source)).not.toBe('');
		});

		it('lists every file under tasks/, by its path from the root', async () => {
			const listing = await (await holding()).list();
			expect(listedUnderTasks(listing)).toEqual(TASK_FILES);
			expect(listing.branch).not.toBe('');
		});

		it('reads a file it lists as the text it holds', async () => {
			const source = await holding();
			for (const path of TASK_FILES) expect(await source.read(path)).toBe(TREE[path]);
		});

		it('reads a file it does not hold as null, rather than throwing', async () => {
			// A read that threw would take the whole load down, where one task that
			// cannot be read is listed as skipped.
			expect(await (await holding()).read('tasks/20260101-000003/TASK.md')).toBeNull();
		});

		it('points at a file it holds, for an image or a link', async () => {
			expect((await holding()).assetUrl('tasks/20260101-000002/shot.png')).toBeTruthy();
		});

		it('fails to list in the words the page explains, never with a bare error', async () => {
			await expect(subject.broken().list()).rejects.toSatisfy(isExplained);
		});

		it('still answers a read with null when it cannot list', async () => {
			expect(await subject.broken().read(TASK_FILES[0])).toBeNull();
		});

		it('loads as the same repository as every other source', async () => {
			const source = await holding();
			const result = await loadRepository(source, { store: memoryStore() });

			const tasks = result.tasks.toSorted((a, b) => a.id.localeCompare(b.id));
			expect(tasks.map(({ id, title, closed }) => ({ id, title, closed }))).toEqual([
				{ id: '20260101-000001', title: 'Open', closed: false },
				{ id: '20260101-000002', title: 'Closed', closed: true }
			]);
			expect(tasks[1].attachments?.map((attachment) => attachment.name)).toEqual(['shot.png']);
			expect(result.tags.descriptions.get('ui')).toBe('screens');
			expect(result.skipped).toEqual([]);
			expect(result.label).toBe(source.label);
		});

		it('finds what changed since, once read again, where it says it can be', async () => {
			const tree = { ...TREE };
			const source = await subject.holding(tree);
			const added = 'tasks/20260101-000003/TASK.md';
			tree[added] = '# Added since\n\n- STATUS: OPEN\n';
			await subject.sync?.(tree);

			if (canBeReadAgain(source)) await readAgain(source);
			const listed = listedUnderTasks(await source.list());
			expect(!canBeReadAgain(source) || listed.includes(added)).toBe(true);
		});

		it('follows its changes only where it can be read again', async () => {
			// A change is answered by the same refresh a click takes, which a
			// reading that cannot be taken again would answer with nothing.
			const source = await holding();
			expect(!follows(source) || canBeReadAgain(source)).toBe(true);
		});

		it('links a file to its page only with a URL', async () => {
			const page = pageOf(await holding(), TASK_FILES[0]);
			expect(page === undefined || URL.canParse(page)).toBe(true);
		});
	});
}

/**
 * Every kind's sources, one per way a source of that kind comes to be. Each
 * is built inside its kind's own `describe`, so the hooks a kind needs (a
 * global to restore, a folder to close, a scratch folder) are its own.
 */
const SUBJECTS = { github, local, served } satisfies Record<keyof typeof KINDS, () => Subject[]>;

for (const [kind, subjectsOf] of Object.entries(SUBJECTS)) {
	describe(kind, () => {
		for (const subject of subjectsOf()) honoursTheContract(subject);
	});
}
