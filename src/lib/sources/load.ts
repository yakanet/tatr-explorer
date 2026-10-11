/**
 * Loads a source's tasks: list once, then read the task files in parallel.
 *
 * The caller passes the source in rather than this module opening it, so that
 * every later question about the reading goes to the same instance.
 *
 * The cache of a `Cached` source never expires on its own, so quota is spent
 * only on a first visit or an explicit refresh; revalidating would not help, as
 * an unauthenticated 304 still spends quota. Only metadata is cached:
 * descriptions are over half the bytes and cost no quota to read again, and
 * the task ids they reference are extracted at parse time.
 */
import { collectAttachments } from '../tatr/attachments.ts';
import { comparedWith, type Replaced, type Snapshot } from '../tatr/changes.ts';
import { readTask, type Task } from '../tatr/task.ts';
import { parseTaskMd } from '../tatr/task-md.ts';
import { parseTagsFile, type TagDescriptions } from '../tatr/tags-file.ts';
import { isValidHuid } from '../tatr/huid.ts';
import { isCached, isRereadable } from './capabilities.ts';
import { SourceError, type Source } from './contract.ts';
import { openStore, type RepoStore } from './store.ts';

export interface LoadOptions {
	/** Overrides the source's `concurrency`, for a spec. */
	concurrency?: number;
	signal?: AbortSignal;
	/** Called as task files arrive, for progressive rendering. */
	onProgress?: (done: number, total: number) => void;
	/** Ignores any cached copy and reads again, as the refresh control does. */
	refresh?: boolean;
	/**
	 * The reading this one replaces: what was on screen, and what that was
	 * compared with. The result is compared with the first, or keeps the second
	 * when nothing moved (see `comparedWith`).
	 *
	 * The caller passes it rather than the loader reading the cache: a folder
	 * has no cache, and another tab may have stored a reading this one never
	 * showed.
	 */
	replaces?: Replaced | null;
	/** Where to cache; defaults to IndexedDB, falling back to memory. */
	store?: RepoStore;
	now?: () => number;
}

export interface LoadResult {
	tasks: Task[];
	/** Files under `tasks/` that could not be parsed, listed rather than dropped. */
	skipped: { id: string; reason: string }[];
	tags: TagDescriptions;
	fromCache: boolean;
	/** When this reading was fetched, in epoch milliseconds. */
	storedAt: number;
	branch: string;
	/**
	 * What the reader saw before this reading, so a refresh can say what moved.
	 * Null on a first visit, and kept as it was by a reading that moved nothing.
	 */
	previous: Snapshot | null;
}

/** Runs `worker` over `items` with a bounded number in flight. */
async function pooled<T, R>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;

	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = next++;
			if (index >= items.length) return;
			results[index] = await worker(items[index]);
		}
	});

	await Promise.all(runners);
	return results;
}

/** What is cached: the result without `fromCache` and `storedAt`, and without descriptions. */
type CachedLoad = Omit<LoadResult, 'fromCache' | 'storedAt'>;

/** Drops the task descriptions before storing. */
function withoutDescriptions(tasks: Task[]): Task[] {
	return tasks.map(({ description: _description, ...rest }) => rest);
}

/** Turns the files read into tasks, listing those it cannot read or parse as skipped. */
function assemble(
	contents: { path: string; text: string | null }[],
	attachments: ReturnType<typeof collectAttachments>
): { tasks: Task[]; skipped: { id: string; reason: string }[] } {
	const tasks: Task[] = [];
	const skipped: { id: string; reason: string }[] = [];

	for (const { path, text } of contents) {
		const id = path.split('/')[1];
		if (!isValidHuid(id)) {
			skipped.push({ id, reason: 'Folder name is not a task id' });
			continue;
		}
		if (text === null) {
			skipped.push({ id, reason: 'Could not be read' });
			continue;
		}
		const task = readTask(id, text);
		if (!task) {
			skipped.push({ id, reason: 'Could not be parsed' });
			continue;
		}
		const carried = attachments.get(id);
		tasks.push(carried ? { ...task, attachments: carried } : task);
	}

	return { tasks, skipped };
}

const TASK_FILE = /^tasks\/[^/]+\/TASK\.md$/;

/**
 * Loads a source's tasks. A `Cached` source is read from its cache unless
 * `refresh` is set, and its cache is written after a fresh reading; any other
 * source is read every time.
 */
export async function loadRepository(
	source: Source,
	options: LoadOptions = {}
): Promise<LoadResult> {
	if (options.refresh && isRereadable(source)) await source.reread(options.signal);

	const store = options.store ?? openStore();

	if (isCached(source) && !options.refresh) {
		const cached = await store.read<CachedLoad>(source.cacheKey);
		if (cached) {
			return {
				...cached.value,
				// A record stored before `previous` existed lacks it.
				previous: cached.value.previous ?? null,
				fromCache: true,
				storedAt: cached.storedAt
			};
		}
	}

	const listing = await source.list(options.signal);
	const taskFiles = listing.entries.filter((entry) => TASK_FILE.test(entry.path));
	// Costs no request: the listing already holds every attachment's entry.
	const attachments = collectAttachments(listing.entries);
	if (!listing.entries.some((entry) => entry.path.startsWith('tasks/'))) {
		throw new SourceError(
			'no-tasks-folder',
			`${source.label} was read, but it has no tasks/ folder at its root.`
		);
	}

	let done = 0;
	const contents = await pooled(
		taskFiles,
		options.concurrency ?? source.concurrency,
		async (entry) => {
			const text = await source.read(entry.path, options.signal);
			options.onProgress?.(++done, taskFiles.length);
			return { path: entry.path, text };
		}
	);

	// A repository may have no tags file.
	const tagsFile = listing.entries.some((entry) => entry.path === 'tasks/tags')
		? await source.read('tasks/tags', options.signal)
		: null;

	const storedAt = options.now?.() ?? Date.now();
	const assembled = assemble(contents, attachments);
	const payload: CachedLoad = {
		...assembled,
		tags: parseTagsFile(tagsFile ?? ''),
		branch: listing.branch,
		// Stored with the reading, so the news it brought survives a reload.
		previous: comparedWith(options.replaces, assembled.tasks)
	};

	if (isCached(source)) {
		const stored = { ...payload, tasks: withoutDescriptions(payload.tasks) };
		await store.write(source.cacheKey, stored, storedAt);
	}

	// Only the cache drops the descriptions; the caller keeps those just read.
	return { ...payload, fromCache: false, storedAt };
}

/** Reads one task's description on demand, for the detail view, as the cache does not keep it. */
export async function loadTaskDescription(source: Source, id: string): Promise<string | null> {
	const text = await source.read(`tasks/${id}/TASK.md`);
	// Only an unreadable file gives null: an empty one has an empty description.
	return text === null ? null : parseTaskMd(text).description;
}
