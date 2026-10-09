/**
 * Loads a repository's tasks: list once, then read the task files in parallel.
 *
 * Only the listing can be rate-limited, so listers are tried in order —
 * GitHub, then ungh — and the result reports which one answered. Contents
 * always come from raw.githubusercontent, which imposes no budget.
 *
 * A loaded repository is cached and never expires on its own: quota is only ever
 * spent on a first visit or on an explicit refresh, so the reader decides when
 * to pay for fresh data. {@link LoadResult.storedAt} carries the age so the UI
 * can show it next to that refresh control.
 *
 * Only metadata is cached — descriptions are more than half the bytes and are
 * cheap to re-read, since raw.githubusercontent costs no quota. What the graph
 * needs from those descriptions, the referenced task ids, is extracted at parse
 * time and kept, so dropping the prose costs no feature.
 */
import { collectAttachments } from '../tatr/attachments.ts';
import { snapshot, type Snapshot } from '../tatr/changes.ts';
import { readTask, type Task } from '../tatr/task.ts';
import { parseTaskMd } from '../tatr/task-md.ts';
import { parseTagsFile, type TagDescriptions } from '../tatr/tags-file.ts';
import { isValidHuid } from '../tatr/huid.ts';
import { describeRef, type RepoRef } from '../repo/ref.ts';
import { ListingError, NoSourceError, type OpenOptions } from './source.ts';
import { openSource } from './open.ts';
import { openStore, type RepoStore } from './store.ts';

export interface LoadOptions {
	/** Passed through to the source; see {@link OpenOptions.listers}. */
	listers?: OpenOptions['listers'];
	/** Parallel reads. Polite to the CDN while still finishing in well under a second. */
	concurrency?: number;
	signal?: AbortSignal;
	/** Called as task files arrive, for progressive rendering. */
	onProgress?: (done: number, total: number) => void;
	fetchImpl?: typeof fetch;
	/** Ignore any cached copy and fetch again. This is what the refresh control does. */
	refresh?: boolean;
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
	 * The state the reader last saw, when this reading replaced one — so a
	 * refresh can say what moved. Null on a first visit, and replaced rather
	 * than cleared: a comparison lasts exactly as long as the reading it came
	 * with.
	 */
	previous: Snapshot | null;
	/**
	 * How this reading names itself on screen: `owner/name`, or the name of the
	 * folder that was opened — which no URL carries, so only the reading knows.
	 */
	label: string;
}

export class NoTasksFolderError extends Error {
	constructor(ref: RepoRef) {
		super(`${describeRef(ref)} has no tasks/ folder at its root`);
		this.name = 'NoTasksFolderError';
	}
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
type CachedLoad = Omit<LoadResult, 'fromCache' | 'storedAt' | 'label'>;

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
 * `cacheKey` is the whole of it. A source that spends an API budget names a
 * place to be cached, and the reader's quota is protected; a source that reads
 * a folder for nothing answers null, and there is no cache to go stale.
 */
export async function loadRepository(ref: RepoRef, options: LoadOptions = {}): Promise<LoadResult> {
	const source = openSource(ref, { fetchImpl: options.fetchImpl, listers: options.listers });
	if (!source) {
		throw new ListingError('unsupported-host', ref.host, `${ref.host} is not served`);
	}

	// For a forge a refresh is this function ignoring the cache; for a folder it
	// is the folder being walked again, which only the source can do.
	if (options.refresh) await source.refresh?.();

	const store = options.store ?? openStore();
	const key = source.cacheKey;

	if (key && !options.refresh) {
		const cached = await store.read<CachedLoad>(key);
		// IndexedDB stores structured clones, so Date and Map come back intact.
		if (cached) {
			return {
				...cached.value,
				// A record written before this field existed has nothing behind it.
				previous: cached.value.previous ?? null,
				fromCache: true,
				storedAt: cached.storedAt,
				label: source.label
			};
		}
	}

	// What the reader last saw, read before the write that loses it. Only a
	// refresh has anything behind it: a first visit is not a comparison.
	const seen = key && options.refresh ? await store.read<CachedLoad>(key) : null;

	const listing = await source.list(options.signal);
	const taskFiles = listing.entries.filter((entry) => TASK_FILE.test(entry.path));
	// Free: the whole tree came down in the listing, and these are the entries
	// that were being discarded.
	const attachments = collectAttachments(listing.entries);
	if (!listing.entries.some((entry) => entry.path.startsWith('tasks/'))) {
		throw new NoTasksFolderError(ref);
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
	const payload: CachedLoad = {
		...assemble(contents, attachments),
		tags: parseTagsFile(tagsFile ?? ''),
		branch: listing.branch,
		previous: seen ? snapshot(seen.value.tasks, seen.storedAt) : null
	};

	if (key) {
		await store.write(key, { ...payload, tasks: withoutDescriptions(payload.tasks) }, storedAt);
	}

	// The caller gets the bodies it just paid for; only the cache goes without.
	return { ...payload, fromCache: false, storedAt, label: source.label };
}

/**
 * Reads one task's body on demand, for the detail view. Free of the API budget,
 * and roughly 30 ms, so it is cheaper to re-read than to keep every description
 * in storage.
 */
export async function loadTaskDescription(
	ref: RepoRef,
	branch: string,
	id: string,
	options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<string | null> {
	// One read, wherever the file is: a fetch of a raw URL, or a file already in
	// memory. The branch is passed rather than assumed, being what the reading
	// resolved.
	const source = openSource(ref, { branch, fetchImpl: options.fetchImpl });
	const text = source ? await source.read(`tasks/${id}/TASK.md`, options.signal) : null;
	// `null` is a file that could not be read; an empty one is a file that says
	// nothing, and those are not the same answer even where they look alike.
	return text === null ? null : parseTaskMd(text).description;
}
