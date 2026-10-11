/**
 * The behaviour every source must have, checked on each one over the same
 * tree. `contract.ts` declares what a source has; this spec fails when a new
 * source does the wrong thing with it.
 *
 * `SUBJECTS` is keyed like `SOURCES`, so a source added to the registry and not
 * here does not compile. It lives here rather than in `tests/support`, because
 * nothing else builds these subjects.
 *
 * Each source's own spec checks what `assetUrl` answers for a missing file,
 * which a forge cannot know without a listing, and the branch a listing names,
 * which a folder reads from `.git/HEAD`.
 */
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { directory, entryTree, fileList } from '#tests/support/fake-directory.ts';
import { scratchFolder, serving, writeTree } from '#tests/support/disk-tree.ts';
import { unreachable } from '#tests/support/network.ts';
import { parseForgePath } from '../repo/ref.ts';
import { isCached, isFollowable, isLinked, isRereadable, isWritable } from './capabilities.ts';
import { GitHubRepositorySource } from './github/source.ts';
import { loadRepository } from './load.ts';
import {
	fromDirectoryEntry,
	fromDirectoryHandle,
	fromFileList,
	type LocalFolder,
	type WayBack
} from './local/folder.ts';
import { closeFolder, LocalFolderSource, openFolder } from './local/source.ts';
import type { SourceId } from './open.ts';
import { FollowedServedSource, ServedSource } from './served/source.ts';
import { SourceError, type Listing, type Source } from './contract.ts';
import { memoryStore } from './store.ts';

/** One way to build a source for the contract. */
interface Subject {
	/** How the source was built, which names its tests. */
	name: string;
	/**
	 * A source holding `tree`, a map from paths to contents. A later change to
	 * `tree` is there for the source to find when it reads again.
	 */
	holding(tree: Record<string, string>): Promise<Source>;
	/** A source whose listing fails, the way this one fails in practice. */
	broken(): Source;
	/** Copies a change to `tree` to where the source reads, when that is not `tree` itself. */
	sync?(tree: Record<string, string>): Promise<unknown>;
}

/** A repository every source can hold: two tasks, an attachment and a tags file. */
const TREE: Readonly<Record<string, string>> = {
	'tasks/20260101-000001/TASK.md':
		'# Open\n\n- STATUS: OPEN\n- PRIORITY: 90\n- TAGS: ui\n\nA body.\n',
	'tasks/20260101-000002/TASK.md': '# Closed\n\n- STATUS: CLOSED\n- PRIORITY: 50\n',
	'tasks/20260101-000002/shot.png': 'not much of a picture',
	'tasks/tags': 'ui , screens\n'
};

/** The paths under `tasks/`, sorted: a folder keeps nothing else, so nothing else is compared. */
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

		it('declares what the loader and the page ask of it', async () => {
			const source = await holding();
			expect(source.label).not.toBe('');
			expect(source.cost.listing).not.toBe('');
			expect(source.concurrency).toBeGreaterThanOrEqual(1);
			// An empty key would make every such source share one cache entry.
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
			// A `follow` without a `reread` is no capability (see `Followable`).
			// What following does is left to each source's spec.
			const source = await holding();
			expect(isFollowable(source)).toBe('follow' in source);
		});

		it('links a file to its page only with a URL', async () => {
			const page = pageOf(await holding(), TASK_FILES[0]);
			expect(page === undefined || URL.canParse(page)).toBe(true);
		});

		it('writes a file whole where it can, never over a change it did not read', async (context) => {
			const source = await holding();
			if (!isWritable(source)) return context.skip();
			const [path] = TASK_FILES;
			const written = '# Written\n\n- STATUS: CLOSED\n';

			expect(await source.write(path, written, TREE[path])).toBe('written');
			expect(await source.read(path)).toBe(written);

			// The write just made stands for an editor's save, which `expected` predates.
			expect(await source.write(path, '# Lost\n', TREE[path])).toBe('changed');
			expect(await source.read(path)).toBe(written);
		});

		it('fails to write in the words the page explains, never with a bare error', async (context) => {
			const source = subject.broken();
			if (!isWritable(source)) return context.skip();
			const [path] = TASK_FILES;
			await expect(source.write(path, '# b\n', TREE[path])).rejects.toBeInstanceOf(SourceError);
		});
	});
}

/**
 * A fake network serving `tree` as GitHub does: the trees API lists it, the CDN
 * serves each file. It reads `tree` on every request, so a change shows on the
 * next one. Called with a `this`, it throws, as the browser's `fetch` does
 * unless called on the window.
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
		// `/owner/repo/HEAD/tasks/...`: the file's path follows the branch.
		const path = decodeURIComponent(url.pathname.split('/').slice(4).join('/'));
		if (!Object.hasOwn(tree, path)) return new Response('not found', { status: 404 });
		return new Response(tree[path]);
	} as typeof fetch;
}

function openGitHubOver(network: typeof fetch): Source {
	return new GitHubRepositorySource(parseForgePath('owner/repo')!, network);
}

/**
 * One way a browser hands over a folder (a directory input, a picker, a drop):
 * the folder, and a way back to it when there is one.
 */
type Door = (tree: Record<string, string>) => Promise<[LocalFolder, WayBack?]>;

/** A subject for a folder handed over through `door`. */
function through(name: string, door: Door): Subject {
	return {
		name,
		async holding(tree) {
			openFolder(...(await door(tree)));
			return LocalFolderSource.open();
		},
		broken: forgotten
	};
}

/** No folder open, as after every reload, when the browser takes its grant back. */
function forgotten(): Source {
	closeFolder();
	return LocalFolderSource.open();
}

/** A dev channel on which nothing is sent: the contract only needs one to exist. */
const SILENT = { on() {}, off() {} } as unknown as ViteHotContext;

/**
 * Every source, once per way it can be built. Each entry runs inside its own
 * `describe`, so a source's hooks (a folder to close, a scratch folder) stay
 * its own.
 */
const SUBJECTS = {
	github: () => [
		{
			name: 'a repository on GitHub',
			holding: async (tree) => openGitHubOver(forge(tree)),
			broken: () => openGitHubOver(unreachable)
		}
	],

	// One per `Door`: each hands over different things, and each must read as a source.
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

	// With the dev channel, as the application opens it, and without, as a spec can.
	served: () => {
		const scratch = scratchFolder();
		const served = (name: string, open: (network: typeof fetch) => Source): Subject => ({
			name,
			async holding(tree) {
				await writeTree(scratch(), tree);
				return open(await serving(scratch()));
			},
			broken: () => open(unreachable),
			// This source reads the disk, so a change to `tree` has to be written there.
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
} satisfies Record<SourceId, () => Subject[]>;

for (const [id, subjectsOf] of Object.entries(SUBJECTS)) {
	describe(id, () => {
		for (const subject of subjectsOf()) honoursTheContract(subject);
	});
}
