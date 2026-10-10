/**
 * Loading state for one repository.
 *
 * The two phases are visible on purpose: listing is one request that can be
 * rate-limited, then the task files stream in and are counted. Showing that
 * split is what lets the UI explain a failure instead of just spinning.
 */
import { loadRepository, NoTasksFolderError } from '../sources/load.ts';
import { ListingError, NoSourceError, type ListingFailure } from '../sources/source.ts';
import { describeRef, type RepoRef } from '../repo/ref.ts';
import { compare, type Changes, type Movement, type Snapshot } from '../tatr/changes.ts';
import type { Task } from '../tatr/task.ts';
import type { TagDescriptions } from '../tatr/tags-file.ts';

/** Context key for the repository shared by every view of one repository. */
export const REPOSITORY = Symbol('repository');

export type Phase = 'idle' | 'listing' | 'reading' | 'ready' | 'failed';

export interface Failure {
	kind: ListingFailure | 'no-tasks-folder' | 'no-source' | 'unknown';
	message: string;
}

export class RepositoryState {
	phase = $state<Phase>('idle');
	tasks = $state<Task[]>([]);
	skipped = $state<{ id: string; reason: string }[]>([]);
	tags = $state<TagDescriptions>({ descriptions: new Map(), redefined: [] });
	/** Files read so far, and how many there are, for the progress bar. */
	done = $state(0);
	total = $state(0);
	/** What the reading calls itself: `owner/name`, or the folder's own name. */
	label = $state('');
	/** What is being read, kept so a view can name it before there is a reading. */
	ref = $state<RepoRef | null>(null);
	fromCache = $state(false);
	storedAt = $state(0);
	branch = $state('HEAD');
	failure = $state<Failure | null>(null);
	/**
	 * A refresh that could not be taken, over a reading that stands.
	 *
	 * Separate from `failure` because they say opposite things: that one means
	 * there is nothing to show, this one means what is on screen is the last
	 * reading and still true. A spent budget is the ordinary way here, and
	 * trading a good reading for an error page would punish pressing Refresh.
	 */
	refreshFailure = $state<Failure | null>(null);
	/** The state the reader last saw, when this reading replaced one. */
	previous = $state<Snapshot | null>(null);

	#controller: AbortController | null = null;

	/**
	 * How to name this repository on screen, at any point in a load.
	 *
	 * The reading knows best (a local folder's name is in it and nowhere else),
	 * but a page has a title before there is a reading, so the reference stands
	 * in until then.
	 */
	readonly name = $derived(this.label || (this.ref ? describeRef(this.ref) : ''));

	readonly open = $derived(this.tasks.filter((task) => !task.closed));

	/**
	 * What moved since the reader's last reading, or null when there is nothing
	 * to say: a first visit, or an unchanged repository.
	 *
	 * Null rather than an empty result, so a view has one thing to test and
	 * cannot mark a row for having done nothing. It stands as long as the
	 * reading does: there is no dismissing it, because the next refresh is a new
	 * reading and takes the comparison with it.
	 */
	readonly changes = $derived.by((): Changes | null => {
		if (!this.previous) return null;
		const changes = compare(this.previous, this.tasks);
		return changes.total > 0 ? changes : null;
	});

	/** Loads a repository. Pass `refresh` to spend quota and get a fresh view. */
	async load(ref: RepoRef, refresh = false): Promise<void> {
		this.#controller?.abort();
		const controller = new AbortController();
		this.#controller = controller;

		// Only a refresh over a reading has something to protect: from `failed`, or
		// from another repository, there is nothing on screen worth keeping.
		//
		// Both reads are behind `refresh` on purpose. This method is called from
		// an effect, so a read here makes that effect depend on state this same
		// method then writes, and `previous` is written a few lines down. Read
		// unconditionally, it re-ran the effect, whose cleanup aborted the reading
		// in flight, which left the page on its loading screen forever: exactly as
		// long as a cached comparison kept the value changing.
		const standing = refresh && this.phase === 'ready';
		const held = standing ? this.previous : null;

		this.ref = ref;
		this.phase = 'listing';
		this.failure = null;
		this.refreshFailure = null;
		this.done = 0;
		this.total = 0;
		// A comparison belongs to the reading that produced it. One state serves
		// every view, so without this a move to another repository would announce
		// the last one's news over the new one's tasks.
		this.previous = null;

		try {
			const result = await loadRepository(ref, {
				refresh,
				signal: controller.signal,
				onProgress: (done, total) => {
					if (controller.signal.aborted) return;
					this.phase = 'reading';
					this.done = done;
					this.total = total;
				}
			});
			if (controller.signal.aborted) return;

			this.tasks = result.tasks;
			this.skipped = result.skipped;
			this.tags = result.tags;
			this.label = result.label;
			this.fromCache = result.fromCache;
			this.storedAt = result.storedAt;
			this.branch = result.branch;
			this.previous = result.previous;
			this.phase = 'ready';
		} catch (error) {
			if (controller.signal.aborted) return;
			if (standing) {
				// The comparison goes back with the reading it belongs to: the tasks
				// were never replaced, so its badges would otherwise vanish for a
				// reason the reader has no way to see.
				this.previous = held;
				this.refreshFailure = describe(error);
				this.phase = 'ready';
				return;
			}
			this.failure = describe(error);
			this.phase = 'failed';
		}
	}

	/** What a marked row says on hover: how it moved, and since when. */
	describeMoves(moves: Movement[]): string {
		return `${moves.join(', ')} since your reading ${describeAge(this.previous?.at ?? 0)}`;
	}

	abort(): void {
		this.#controller?.abort();
		this.#controller = null;
	}
}

function describe(error: unknown): Failure {
	if (error instanceof NoSourceError) {
		// A source with nothing behind it yet: today only a folder can be in that
		// state, the browser having taken its grant back on the reload.
		return { kind: 'no-source', message: error.message };
	}
	if (error instanceof NoTasksFolderError) {
		return { kind: 'no-tasks-folder', message: error.message };
	}
	if (error instanceof ListingError) {
		return { kind: error.failure, message: error.message };
	}
	return {
		kind: 'unknown',
		message: error instanceof Error ? error.message : 'Something went wrong'
	};
}

/**
 * The wording is `Intl`'s, so plurals are not spelled out here. `numeric:
 * 'always'` rather than `'auto'`, which turns one day into "yesterday": a
 * cache reads better on one scale throughout.
 */
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/**
 * For the refresh control: "just now", "12 minutes ago", "3 hours ago".
 *
 * The thresholds are the part worth having: `Intl` formats a number and a unit,
 * it does not choose them, and "just now" is not a unit it knows.
 */
export function describeAge(storedAt: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - storedAt) / 1000));
	if (seconds < 45) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return RELATIVE.format(-minutes, 'minute');
	const hours = Math.round(minutes / 60);
	if (hours < 24) return RELATIVE.format(-hours, 'hour');
	return RELATIVE.format(-Math.round(hours / 24), 'day');
}
