/**
 * The behaviour every source must have, checked on each one over the same
 * tree. `contract.ts` declares what a source has; this spec fails when a new
 * source does the wrong thing with it.
 *
 * `SUBJECTS` is keyed like `SOURCES`, with at least one subject per key, so a
 * source added to the registry and not here does not compile. It lives here
 * rather than in `tests/support`, because nothing else builds these subjects.
 *
 * Each source's own spec checks what `assetUrl` answers for a missing file,
 * which a forge cannot know without a listing, and the branch a listing names,
 * which a folder reads from `.git/HEAD`.
 */
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { having } from '#tests/support/capabilities.ts';
import { directory, entryTree, fileList } from '#tests/support/fake-directory.ts';
import { scratchFolder, serving, writeTree } from '#tests/support/disk-tree.ts';
import { unreachable } from '#tests/support/network.ts';
import { parseForgePath } from '../repo/ref.ts';
import {
	isBranched,
	isCached,
	isFollowable,
	isLinked,
	isRereadable,
	isWritable
} from './capabilities.ts';
import { GitHubRepositorySource } from './github/source.ts';
import { loadRepository } from './load.ts';
import { fromDirectoryEntry } from './local/directory-entry.ts';
import { fromDirectoryHandle } from './local/directory-handle.ts';
import { fromFileList, type LocalFolder } from './local/folder.ts';
import { closeFolder, LocalFolderSource, openFolder, type WayBack } from './local/source.ts';
import type { SourceId } from './open.ts';
import { FollowedServedSource, ServedSource } from './served/source.ts';
import { SourceError, type Listing, type Source } from './contract.ts';
import { memoryStore } from './store.ts';

/**
 * The capabilities a subject declares, each checked against its source. Writing
 * is declared by `failingToWrite` instead, which its tests need anyway.
 */
const GUARDS = {
	cached: isCached,
	rereadable: isRereadable,
	linked: isLinked,
	followable: isFollowable,
	branched: isBranched
};

type Capability = keyof typeof GUARDS;

/** One way to build a source for the contract. */
interface Subject {
	/** How the source was built, which names its tests. */
	name: string;
	/** The capabilities its source has, among `GUARDS`. */
	has: Capability[];
	/**
	 * A source holding `tree`, a map from paths to contents. A later change to
	 * `tree` is there for the source to find when it reads again.
	 */
	holding(tree: Record<string, string>): Promise<Source>;
	/** A source whose listing fails, the way this one fails in practice. */
	broken(): Source;
	/**
	 * A source whose writes fail, the way this one's fail in practice. Given
	 * only for a source that writes.
	 */
	failingToWrite?(): Promise<Source>;
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

function honoursTheContract(subject: Subject): void {
	describe(`${subject.name}, as a source`, () => {
		const holding = () => subject.holding({ ...TREE });

		it('declares what the loader and the page ask of it', async () => {
			const source = await holding();
			expect(source.label).not.toBe('');
			expect(source.cost.listing).not.toBe('');
			expect(source.concurrency).toBeGreaterThanOrEqual(1);
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

		// A capability its subject leaves out would go unchecked, its tests skipped unseen.
		it('has exactly the capabilities its subject declares', async () => {
			const source = await holding();
			const found = Object.entries(GUARDS)
				.filter(([, is]) => is(source))
				.map(([name]) => name);
			expect(found.toSorted()).toEqual(subject.has.toSorted());
			expect(isWritable(source)).toBe(subject.failingToWrite !== undefined);
		});

		if (subject.has.includes('cached')) {
			it('is cached under a key of its own', async () => {
				// An empty key would make every such source share one cache entry.
				expect(having(await holding(), isCached).cacheKey).not.toBe('');
			});
		}

		if (subject.has.includes('rereadable')) {
			it('finds what changed since, once read again', async () => {
				const tree = { ...TREE };
				const source = having(await subject.holding(tree), isRereadable);
				const added = 'tasks/20260101-000003/TASK.md';
				const [edited] = TASK_FILES;
				tree[added] = '# Added since\n\n- STATUS: OPEN\n';
				tree[edited] = '# Edited since\n';
				await subject.sync?.(tree);

				await source.reread();
				expect(listedUnderTasks(await source.list())).toContain(added);
				expect(await source.read(edited)).toBe('# Edited since\n');
			});
		}

		if (subject.has.includes('linked')) {
			it('links a file to its page with a URL', async () => {
				const page = having(await holding(), isLinked).fileUrl(TASK_FILES[0]);
				expect(URL.canParse(page)).toBe(true);
			});
		}

		if (subject.failingToWrite) writesAsTheContractSays(holding, subject.failingToWrite);
	});
}

/** The writing tests, for a source whose subject says it writes. */
function writesAsTheContractSays(
	holding: () => Promise<Source>,
	failingToWrite: () => Promise<Source>
): void {
	it('writes a file whole, never over a change it did not read', async () => {
		const source = having(await holding(), isWritable);
		const [path] = TASK_FILES;
		const written = '# Written\n\n- STATUS: CLOSED\n';

		expect(await source.write(path, written, TREE[path])).toBe('written');
		expect(await source.read(path)).toBe(written);

		// The write just made stands for an editor's save, which `expected` predates.
		expect(await source.write(path, '# Lost\n', TREE[path])).toBe('changed');
		expect(await source.read(path)).toBe(written);
	});

	it('creates a file where there was none, never over one it did not read', async () => {
		const source = having(await holding(), isWritable);
		const path = 'tasks/20260101-000003/TASK.md';
		const created = '# Created\n\n- STATUS: OPEN\n';

		expect(await source.write(path, created, null)).toBe('written');
		expect(await source.read(path)).toBe(created);
		expect(listedUnderTasks(await source.list())).toContain(path);

		expect(await source.write(path, '# Lost\n', null)).toBe('changed');
		expect(await source.read(path)).toBe(created);
	});

	it('creates a file from bytes, as an image is', async () => {
		const source = having(await holding(), isWritable);
		const path = 'tasks/20260101-000001/pasted.png';
		expect(await source.write(path, new Blob(['a picture']), null)).toBe('written');
		expect(await source.read(path)).toBe('a picture');
	});

	it('creates nothing outside tasks/, in the words the page explains', async () => {
		const source = having(await holding(), isWritable);
		for (const path of ['README.md', 'tasks/../README.md', 'tasks/20260101-000001/../../x']) {
			await expect(source.write(path, 'x', null)).rejects.toBeInstanceOf(SourceError);
		}
		expect(listedUnderTasks(await source.list())).toEqual(TASK_FILES);
	});

	it('fails to write in the words the page explains, never with a bare error', async () => {
		const source = having(await failingToWrite(), isWritable);
		const [path] = TASK_FILES;
		await expect(source.write(path, '# b\n', TREE[path])).rejects.toBeInstanceOf(SourceError);
		await expect(source.write('tasks/x/TASK.md', '# x\n', null)).rejects.toBeInstanceOf(
			SourceError
		);
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

/** The source of a folder handed over through `door`, holding `tree`. */
async function openedThrough(door: Door, tree: Record<string, string>): Promise<Source> {
	openFolder(...(await door(tree)));
	return LocalFolderSource.open();
}

/** A subject for a folder handed over through `door`. */
function through(name: string, has: Capability[], door: Door): Subject {
	return { name, has, holding: (tree) => openedThrough(door, tree), broken: forgotten };
}

/**
 * A door picking a folder with a handle to it. Given `ask`, it is Chromium's,
 * whose reader answers `ask` when the page asks to write.
 */
function picked(ask?: () => Promise<PermissionState>): Door {
	return async (tree) => {
		const handle = directory('my-project', tree, ask);
		return [await fromDirectoryHandle(handle), handle];
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
			has: ['cached', 'rereadable', 'linked', 'branched'],
			holding: async (tree) => openGitHubOver(forge(tree)),
			broken: () => openGitHubOver(unreachable)
		}
	],

	// One per `Door`: each hands over different things, and each must read as a source.
	local: () => {
		afterEach(() => closeFolder());
		return [
			through('a folder handed over by a directory input', [], async (tree) => [
				fromFileList(fileList('my-project', tree))!
			]),
			through('a folder picked, with a handle to it', ['rereadable', 'followable'], picked()),
			{
				...through(
					'a folder picked on Chromium, whose reader allows writing',
					['rereadable', 'followable'],
					picked(async () => 'granted')
				),
				// The browser refuses to ask long after the last click, the usual failure.
				failingToWrite: () =>
					openedThrough(
						picked(() => Promise.reject(new DOMException('no click', 'SecurityError'))),
						{ ...TREE }
					)
			},
			// A drop's entry tree walks again without a dialog (checked on Firefox),
			// so a dropped folder offers Refresh rather than "Reopen…".
			through(
				'a folder dropped, with its entry tree',
				['rereadable', 'followable'],
				async (tree) => {
					const entry = entryTree('my-project', tree);
					return [await fromDirectoryEntry(entry), entry];
				}
			)
		];
	},

	// With the dev channel, as the application opens it, and without, as a spec can.
	served: () => {
		const scratch = scratchFolder();
		const served = (
			name: string,
			has: Capability[],
			open: (network: typeof fetch) => Source
		): Subject => ({
			name,
			has,
			async holding(tree) {
				await writeTree(scratch(), tree);
				return open(await serving(scratch()));
			},
			broken: () => open(unreachable),
			failingToWrite: async () => open(unreachable),
			// This source reads the disk, so a change to `tree` has to be written there.
			sync: (tree) => writeTree(scratch(), tree)
		});
		return [
			served(
				'a folder the dev server serves',
				['rereadable'],
				(network) => new ServedSource('my-project', network)
			),
			served(
				'a folder the dev server serves, followed over its channel',
				['rereadable', 'followable'],
				(network) => new FollowedServedSource('my-project', SILENT, network)
			)
		];
	}
} satisfies Record<SourceId, () => [Subject, ...Subject[]]>;

for (const [id, subjectsOf] of Object.entries(SUBJECTS)) {
	describe(id, () => {
		for (const subject of subjectsOf()) honoursTheContract(subject);
	});
}
