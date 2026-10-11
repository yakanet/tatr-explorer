/**
 * Loading state for one repository.
 *
 * The two phases are visible on purpose: listing is one request that can be
 * rate-limited, then the task files stream in and are counted. Showing that
 * split is what lets the UI explain a failure instead of just spinning.
 */
import { loadRepository, NoTasksFolderError } from '../sources/load.ts';
import { openSource } from '../sources/open.ts';
import {
	ListingError,
	NoSourceError,
	type ListingFailure,
	type Source
} from '../sources/source.ts';
import { describeRef, type RepoRef } from '../repo/ref.ts';
import {
	compare,
	snapshot,
	type Changes,
	type Movement,
	type Replaced,
	type Snapshot
} from '../tatr/changes.ts';
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
	/**
	 * Raw, like `previous`: both are replaced whole and never edited in place.
	 * A deep proxy would cost a signal per field read, and its arrays would end
	 * up in the comparison the cache stores, which IndexedDB refuses to clone.
	 */
	tasks = $state.raw<Task[]>([]);
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
	previous = $state.raw<Snapshot | null>(null);
	/**
	 * The source the reading came from, opened once per reference and kept
	 * across its refreshes.
	 *
	 * Held rather than reopened from the reference wherever it is needed, so a
	 * question about the reading (can it be taken again, where does one of its
	 * files live) goes to the instance that produced it, and a source holding
	 * something of its own holds it once. Raw: an object of closures, which
	 * there is nothing to gain by proxying.
	 */
	source = $state.raw<Source | null>(null);
	/**
	 * A refresh in flight over a reading that stays on screen until it lands.
	 *
	 * The phase does not move for it. Every view renders a `ready` reading, and
	 * going back to `listing` unmounted them, losing the scroll position and
	 * whatever was being typed, while the reading they showed was still true.
	 */
	refreshing = $state(false);

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
	 * cannot mark a row for having done nothing. There is no dismissing it: the
	 * next reading that moves something replaces it, and one that moves nothing
	 * leaves it standing.
	 */
	readonly changes = $derived.by((): Changes | null => {
		if (!this.previous) return null;
		const changes = compare(this.previous, this.tasks);
		return changes.total > 0 ? changes : null;
	});

	/**
	 * Loads a reference afresh: a source of its own, and nothing kept from the
	 * reading before, which belonged to whatever was read last.
	 *
	 * Reads nothing of this state. It runs inside the layout's effect, and a
	 * read here would make that effect depend on what this method writes: it
	 * re-ran, its cleanup aborted the reading in flight, and the page stayed on
	 * its loading screen forever.
	 */
	load(ref: RepoRef): Promise<void> {
		return this.#read(ref, { refresh: false, source: null, replaces: null });
	}

	/**
	 * Takes the reading again, past the cache. The one on screen stays until the
	 * new one lands, read from the same source, and is what it is compared with.
	 *
	 * Called from a click, never from an effect, which is what lets it read the
	 * state freely.
	 */
	refresh(): Promise<void> {
		const { ref, source } = this;
		if (!ref) return Promise.resolve();
		if (this.phase === 'ready' && source) {
			const replaces = { shown: snapshot(this.tasks, this.storedAt), previous: this.previous };
			return this.#read(ref, { refresh: true, source, replaces });
		}
		// Nothing on screen to keep, as after a failure: the loading steps again,
		// from the source already opened, `load` being the one place that opens.
		return this.#read(ref, { refresh: true, source, replaces: null });
	}

	/**
	 * Takes a reading of `ref`, from `source` when one was opened already.
	 *
	 * `replaces` is the reading on screen when it stays there meanwhile, with
	 * what it was compared with, for the new one to be compared in turn; null
	 * when there is nothing to keep, and the page shows the loading steps
	 * instead. It is apart from `source` because a source can outlive its
	 * reading: a failed one leaves the source behind.
	 */
	async #read(
		ref: RepoRef,
		{
			refresh,
			source,
			replaces
		}: { refresh: boolean; source: Source | null; replaces: Replaced | null }
	): Promise<void> {
		this.#controller?.abort();
		const controller = new AbortController();
		this.#controller = controller;
		const standing = replaces !== null;

		this.ref = ref;
		// Before the source is opened, which throws for a reference nothing claims:
		// the last reference's source must not stay behind for this one.
		this.source = source;
		this.refreshFailure = null;
		this.refreshing = standing;
		if (!standing) {
			this.phase = 'listing';
			this.failure = null;
			this.done = 0;
			this.total = 0;
			// A comparison belongs to the reading that produced it. One state serves
			// every view, so without this a move to another repository would
			// announce the last one's news over the new one's tasks.
			this.previous = null;
		}

		try {
			const read = source ?? openSource(ref);
			this.source = read;
			const result = await loadRepository(read, {
				refresh,
				replaces,
				signal: controller.signal,
				onProgress: (done, total) => {
					// The progress panel is for a page with nothing on it yet.
					if (controller.signal.aborted || standing) return;
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
			this.previous = result.previous;
			this.phase = 'ready';
			this.refreshing = false;
		} catch (error) {
			if (controller.signal.aborted) return;
			this.refreshing = false;
			if (standing) {
				// Nothing on screen was touched, the comparison explaining it
				// included: only renewing them failed.
				this.refreshFailure = describe(error);
				return;
			}
			this.failure = describe(error);
			this.phase = 'failed';
		}
	}

	/**
	 * Keeps the reading in step with its source, where the source can tell when
	 * it changes, through the same refresh a click takes. Returns how to stop,
	 * for the layout's effect: that runs it again when the source or the phase
	 * changes, and a refresh moves neither.
	 */
	follow(): (() => void) | undefined {
		const source = this.source;
		if (this.phase !== 'ready' || !source?.follow) return undefined;
		return source.follow(() => void this.refresh());
	}

	/**
	 * Where one of the reading's files loads from, for the renderer. An arrow,
	 * being handed over as a callback.
	 */
	readonly assetUrl = (path: string): string | null => this.source?.assetUrl(path) ?? null;

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
