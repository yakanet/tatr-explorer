/**
 * What every source does, asked of every kind over the same tree.
 *
 * `source.ts` says what a source has; this says what it must do with it, which
 * is what the author of a new source most needs to be told, and in a form that
 * fails when they get it wrong. What only one kind does stays in that kind's
 * own spec.
 *
 * How each kind's sources are built for it is said here too, in a table keyed
 * like the registry: a kind added to `KINDS` and not here does not compile,
 * where a contract each kind had to remember to call would let a new one go
 * unchecked in silence. Here rather than with the fakes the specs share,
 * because nothing but this contract builds them.
 *
 * Only what every source does is asked. A forge cannot tell a missing file's
 * URL from a present one's without a listing, so what `assetUrl` answers for a
 * file that is not there is left to each kind's own spec, and so is the branch
 * a listing names, which a folder reads out of `.git/HEAD` and a forge does not.
 */
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { directory, entryTree, fileList } from '#tests/support/fake-directory.ts';
import { scratchFolder, serving, writeTree } from '#tests/support/disk-tree.ts';
import { unreachable } from '#tests/support/network.ts';
import { localRef, parseRepoPath } from '../repo/ref.ts';
import { isCached, isFollowable, isLinked, isRereadable } from './capabilities.ts';
import { GitHubRepository } from './github/kind.ts';
import { loadRepository } from './load.ts';
import {
	fromDirectoryEntry,
	fromDirectoryHandle,
	fromFileList,
	type LocalFolder,
	type WayBack
} from './local/folder.ts';
import { closeFolder, localKind, openFolder } from './local/kind.ts';
import type { KINDS } from './open.ts';
import { FollowedServedSource, ServedSource } from './served/kind.ts';
import { SourceError, type Listing, type Source } from './source.ts';
import { memoryStore } from './store.ts';

/** One of a kind's sources, as the contract builds it. */
interface Subject {
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

/** The key a source is cached under, or null for one that is not `Cached`. */
function cacheKeyOf(source: Source): string | null {
	if (!isCached(source)) return null;
	return source.cacheKey;
}

/** The page a source links a file to, or undefined for one that is not `Linked`. */
function pageOf(source: Source, path: string): string | undefined {
	if (!isLinked(source)) return undefined;
	return source.fileUrl(path);
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
			await expect(subject.broken().list()).rejects.toBeInstanceOf(SourceError);
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

			if (isRereadable(source)) await source.reread();
			const listed = listedUnderTasks(await source.list());
			expect(!isRereadable(source) || listed.includes(added)).toBe(true);
		});

		it('follows its changes only where it can be read again', async () => {
			// A change is answered by the same refresh a click takes, which a
			// reading that cannot be taken again would answer with nothing: a
			// `follow` without a `reread` is no capability, and is never followed.
			const source = await holding();
			expect(isFollowable(source)).toBe('follow' in source);
		});

		it('links a file to its page only with a URL', async () => {
			const page = pageOf(await holding(), TASK_FILES[0]);
			expect(page === undefined || URL.canParse(page)).toBe(true);
		});
	});
}

/**
 * GitHub over `tree`, through both of its doors: the trees API that lists it,
 * and the CDN that serves each file. Read when asked, so a change to `tree`
 * is there the next time either door is knocked on. Called with a `this`, it
 * refuses, as the browser's own `fetch` does with any but the window.
 */
function forge(tree: Readonly<Record<string, string>>): typeof fetch {
	return async function (this: unknown, input: RequestInfo | URL) {
		if (this !== undefined) throw new TypeError('Illegal invocation');
		const url = new URL(String(input));
		if (url.hostname === 'api.github.com') {
			const blobs = Object.entries(tree).map(([path, text]) => ({
				path,
				type: 'blob',
				size: text.length
			}));
			return Response.json({ tree: blobs, truncated: false });
		}
		// `/owner/repo/HEAD/tasks/...`: the file's path is what follows the branch.
		const path = decodeURIComponent(url.pathname.split('/').slice(4).join('/'));
		if (!Object.hasOwn(tree, path)) return new Response('not found', { status: 404 });
		return new Response(tree[path]);
	} as typeof fetch;
}

function openGitHubOver(network: typeof fetch): Source {
	return new GitHubRepository(parseRepoPath('owner/repo')!, { network });
}

/** What a door hands over for a folder: the folder, and a way back to it when it has one. */
type Door = (tree: Record<string, string>) => Promise<[LocalFolder, WayBack?]>;

/** A folder handed over through `door`, as a source. */
function through(name: string, door: Door): Subject {
	return {
		name,
		async holding(tree) {
			openFolder(...(await door(tree)));
			return localKind.open(localRef());
		},
		broken: forgotten
	};
}

/** Nothing open: where every reload leaves a folder, the browser taking its grant back. */
function forgotten(): Source {
	closeFolder();
	return localKind.open(localRef());
}

/** The dev channel, with nothing said on it: the contract only asks that it is there. */
const SILENT = { on() {}, off() {} } as unknown as ViteHotContext;

/**
 * Every kind's sources, one per way a source of that kind comes to be. Each
 * entry is called inside its kind's own `describe`, so the hooks a kind needs
 * (a folder to close, a scratch folder) are its own.
 */
const SUBJECTS = {
	github: () => [
		{
			name: 'a repository on GitHub',
			holding: async (tree) => openGitHubOver(forge(tree)),
			broken: () => openGitHubOver(unreachable)
		}
	],

	// One per door a browser offers to a folder: they hand over different
	// things, and each must read as a source.
	local: () => {
		afterEach(() => closeFolder());
		return [
			through('a folder handed over by a directory input', async (tree) => [
				fromFileList(fileList('my-project', tree))!
			]),
			through('a folder picked, with a handle to it', async (tree) => {
				const handle = directory('my-project', tree);
				return [await fromDirectoryHandle(handle), handle];
			}),
			through('a folder dropped, with its entry tree', async (tree) => {
				const entry = entryTree('my-project', tree);
				return [await fromDirectoryEntry(entry), entry];
			})
		];
	},

	// Followed over the dev channel, as the application always opens it, and
	// without one, as a spec can.
	served: () => {
		const scratch = scratchFolder();
		const served = (name: string, open: (network: typeof fetch) => Source): Subject => ({
			name,
			async holding(tree) {
				await writeTree(scratch(), tree);
				return open(await serving(scratch()));
			},
			broken: () => open(unreachable),
			// The folder is on the disk, where a change to the tree has to be written.
			sync: (tree) => writeTree(scratch(), tree)
		});
		return [
			served(
				'a folder the dev server serves',
				(network) => new ServedSource('my-project', network)
			),
			served(
				'a folder the dev server serves, followed over its channel',
				(network) => new FollowedServedSource('my-project', SILENT, network)
			)
		];
	}
} satisfies Record<keyof typeof KINDS, () => Subject[]>;

for (const [kind, subjectsOf] of Object.entries(SUBJECTS)) {
	describe(kind, () => {
		for (const subject of subjectsOf()) honoursTheContract(subject);
	});
}
