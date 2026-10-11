/**
 * Loads a source's tasks: list once, then read the task files in parallel.
 *
 * The source is handed in rather than opened here. Which source serves a
 * reference is decided once, by whoever holds the reading, so that every later
 * question about that reading (can it be taken again, where does a file live)
 * goes to the same instance instead of to a copy rebuilt from the reference.
 *
 * A source that is `Cached` is cached and never expires on its own: quota
 * is only ever spent on a first visit or on an explicit refresh, so the reader
 * decides when to pay for fresh data. Revalidating is no way around it: a
 * conditional request answering 304 was measured to spend quota all the same
 * when unauthenticated. {@link LoadResult.storedAt} carries the age so the UI
 * can show it next to that refresh control.
 *
 * Only metadata is cached: descriptions are more than half the bytes and cost
 * no quota to read again. What the graph needs from those descriptions, the
 * referenced task ids, is extracted at parse time and kept, so dropping the
 * prose costs no feature.
 */
import { collectAttachments } from '../tatr/attachments.ts';
import { comparedWith, type Replaced, type Snapshot } from '../tatr/changes.ts';
import { readTask, type Task } from '../tatr/task.ts';
import { parseTaskMd } from '../tatr/task-md.ts';
import { parseTagsFile, type TagDescriptions } from '../tatr/tags-file.ts';
import { isValidHuid } from '../tatr/huid.ts';
import { isCached, isRereadable } from './capabilities.ts';
import { SourceError, type Source } from './source.ts';
import { openStore, type RepoStore } from './store.ts';

export interface LoadOptions {
	/** Parallel reads, when the source's own preference is not the one to test. */
	concurrency?: number;
	signal?: AbortSignal;
	/** Called as task files arrive, for progressive rendering. */
	onProgress?: (done: number, total: number) => void;
	/** Ignore any cached copy and fetch again. This is what the refresh control does. */
	refresh?: boolean;
	/**
	 * The reading this one replaces: what was on screen, and what that was
	 * compared with. The result is compared with the first, or keeps the second
	 * when it moved nothing (see `comparedWith`).
	 *
	 * Given by the caller, who has it on screen, rather than looked up in the
	 * cache: a folder has no cache and changes all the same, and what the reader
	 * last saw is what is in front of them, not what another tab last stored.
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
	/** When this view of the repository was fetched, in epoch milliseconds. */
	storedAt: number;
	branch: string;
	/**
	 * The state the reader last saw, when this reading replaced one, so a
	 * refresh can say what moved. Null on a first visit, replaced by a reading
	 * that moved something and kept by one that moved nothing.
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

/** What is cached: no descriptions, and none of the fields describing this retrieval. */
type CachedLoad = Omit<LoadResult, 'fromCache' | 'storedAt'>;

/** Strips the bodies before storing. References were extracted at parse time. */
function withoutDescriptions(tasks: Task[]): Task[] {
	return tasks.map(({ description: _description, ...rest }) => rest);
}

/**
 * Turns the files that were read into tasks, listing what could not be read
 * rather than dropping it. Shared by both sources: a folder on the disk and a
 * repository on a forge arrive here as the same pairs of path and text.
 */
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
 * Loads a repository, or the folder the reader has open: one path, because the
 * source answers for what used to be branched on here.
 *
 * Whether it is `Cached` is the whole of it. A source that spends an API budget
 * names a place to be cached, and the reader's quota is protected; a source that
 * reads a folder for nothing names none, and there is no cache to go stale.
 */
export async function loadRepository(
	source: Source,
	options: LoadOptions = {}
): Promise<LoadResult> {
	// For a forge a refresh is this function ignoring the cache; for a folder it
	// is the folder being walked again, which only the source can do.
	if (options.refresh && isRereadable(source)) await source.reread(options.signal);

	const store = options.store ?? openStore();

	if (isCached(source) && !options.refresh) {
		const cached = await store.read<CachedLoad>(source.cacheKey);
		// IndexedDB stores structured clones, so Date and Map come back intact.
		if (cached) {
			return {
				...cached.value,
				// A record written before this field existed has nothing behind it.
				previous: cached.value.previous ?? null,
				fromCache: true,
				storedAt: cached.storedAt
			};
		}
	}

	const listing = await source.list(options.signal);
	const taskFiles = listing.entries.filter((entry) => TASK_FILE.test(entry.path));
	// Free: the whole tree came down in the listing, and these are the entries
	// that were being discarded.
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

	// Tag descriptions are optional, and their absence is not an error.
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

	// The caller gets the bodies it just paid for; only the cache goes without.
	return { ...payload, fromCache: false, storedAt };
}

/**
 * Reads one task's body on demand, for the detail view. Free of the API budget,
 * and roughly 30 ms, so it is cheaper to re-read than to keep every description
 * in storage.
 */
export async function loadTaskDescription(source: Source, id: string): Promise<string | null> {
	// One read, wherever the file is: a fetch of a raw URL, or a file already in
	// memory.
	const text = await source.read(`tasks/${id}/TASK.md`);
	// `null` is a file that could not be read; an empty one is a file that says
	// nothing, and those are not the same answer even where they look alike.
	return text === null ? null : parseTaskMd(text).description;
}
