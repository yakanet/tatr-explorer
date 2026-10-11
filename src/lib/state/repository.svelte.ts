/**
 * Loading state for one repository. Listing and reading are separate phases,
 * so the UI can tell a rate-limited listing apart from task files streaming in.
 */
import { isFollowable, isLinked } from '../sources/capabilities.ts';
import { loadRepository } from '../sources/load.ts';
import { openSource } from '../sources/open.ts';
import { SourceError, type Source, type SourceFailure } from '../sources/contract.ts';
import { formatRepoName, isForgeRef, type RepoRef } from '../repo/ref.ts';
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

/** Context key for the repository state shared by every view of one repository. */
export const REPOSITORY = Symbol('repository');

export type Phase = 'idle' | 'listing' | 'reading' | 'ready' | 'failed';

export interface Failure {
	kind: SourceFailure | 'unknown';
	/** The source's message, shown under the kind's heading. */
	message: string;
}

/**
 * The heading of each failure kind, used by the failure panel and by the
 * header when only a refresh failed. Typed against every kind, so a new kind
 * does not compile without a heading.
 */
export const FAILURE_HEADINGS = {
	'rate-limited': 'rate limit reached',
	'not-found': 'not found',
	network: 'unavailable',
	'unsupported-host': 'not supported yet',
	malformed: 'not understood',
	'no-source': 'nothing to read',
	'no-tasks-folder': 'not a tatr repository',
	unknown: 'could not be read'
} satisfies Record<Failure['kind'], string>;

export class RepositoryState {
	phase = $state<Phase>('idle');
	/**
	 * The tasks read, always replaced whole. Raw because a deep proxy costs a
	 * signal per field read, and its arrays would reach the comparison the
	 * cache stores, which IndexedDB cannot clone.
	 */
	tasks = $state.raw<Task[]>([]);
	skipped = $state<{ id: string; reason: string }[]>([]);
	tags = $state<TagDescriptions>({ descriptions: new Map(), redefined: [] });
	/** Files read so far and in total, for the progress bar. */
	done = $state(0);
	total = $state(0);
	/** The reference being read, kept to refresh it and to name it when no source reads it. */
	ref = $state<RepoRef | null>(null);
	fromCache = $state(false);
	storedAt = $state(0);
	failure = $state<Failure | null>(null);
	/**
	 * The failure of a refresh, while the previous reading stays on screen.
	 * Kept apart from `failure`, which means there is nothing to show: a spent
	 * rate limit is the usual cause, and it must not replace a good reading
	 * with an error page.
	 */
	refreshFailure = $state<Failure | null>(null);
	/** The snapshot the reader last saw, when this reading replaced one. */
	previous = $state.raw<Snapshot | null>(null);
	/**
	 * The source the reading came from, opened once per reference and kept
	 * across refreshes, since that instance may hold a subscription or a
	 * permission. Raw because a class keeps its state in private fields, which a
	 * proxy cannot reach.
	 */
	source = $state.raw<Source | null>(null);
	/**
	 * True while a refresh runs over a reading that stays on screen. The phase
	 * stays `ready` meanwhile, because leaving it unmounts every view and loses
	 * the scroll position and any typed input.
	 */
	refreshing = $state(false);

	#controller: AbortController | null = null;

	/**
	 * The repository's name on screen: the source's label, or the reference's
	 * own name before a source is opened or when none reads it.
	 */
	readonly name = $derived(this.source?.label ?? nameOf(this.ref));

	readonly open = $derived(this.tasks.filter((task) => !task.closed));

	/**
	 * What moved since the reader's last reading, or null on a first visit or
	 * when nothing moved. Null rather than an empty result, so a view tests one
	 * thing and never marks a row that did not move. It stands until a later
	 * reading moves something.
	 */
	readonly changes = $derived.by((): Changes | null => {
		if (!this.previous) return null;
		const changes = compare(this.previous, this.tasks);
		return changes.total > 0 ? changes : null;
	});

	/**
	 * Loads a reference afresh, with a new source and nothing kept from the
	 * previous reading.
	 *
	 * It must not read this state: it runs inside the layout's effect, and a
	 * read would make that effect depend on what this method writes, so the
	 * effect would re-run and abort the reading in flight.
	 */
	load(ref: RepoRef): Promise<void> {
		return this.#read(ref, { refresh: false, source: null, replaces: null });
	}

	/**
	 * Reads the repository again past the cache, from the same source. The
	 * reading on screen stays until the new one lands, and the new one is
	 * compared with it. It may read this state because no effect calls it.
	 */
	refresh(): Promise<void> {
		const { ref, source } = this;
		if (!ref) return Promise.resolve();
		if (this.phase === 'ready' && source) {
			const replaces = { shown: snapshot(this.tasks, this.storedAt), previous: this.previous };
			return this.#read(ref, { refresh: true, source, replaces });
		}
		// Nothing on screen to keep, as after a failure: show the loading steps,
		// but keep the opened source, since only `load` opens one.
		return this.#read(ref, { refresh: true, source, replaces: null });
	}

	/**
	 * Reads `ref`, from `source` when one is already open. `replaces` is the
	 * reading that stays on screen meanwhile, or null to show the loading steps.
	 * It is separate from `source` because a failed reading leaves its source
	 * behind.
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
		// Set before opening, which throws for a reference nothing reads, so the
		// previous reference's source does not outlive it.
		this.source = source;
		this.refreshFailure = null;
		this.refreshing = standing;
		if (!standing) {
			this.phase = 'listing';
			this.failure = null;
			this.done = 0;
			this.total = 0;
			// One state serves every view, so a comparison left here would announce
			// the last repository's changes over the next one's tasks.
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
					// Progress shows only on a page with nothing on it yet.
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
			this.fromCache = result.fromCache;
			this.storedAt = result.storedAt;
			this.previous = result.previous;
			this.phase = 'ready';
			this.refreshing = false;
		} catch (error) {
			if (controller.signal.aborted) return;
			this.refreshing = false;
			if (standing) {
				// The reading on screen and its comparison stay untouched.
				this.refreshFailure = describe(error);
				return;
			}
			this.failure = describe(error);
			this.phase = 'failed';
		}
	}

	/**
	 * Refreshes the reading whenever a followable source reports a change, and
	 * returns the function that stops it. The layout's effect re-runs it when
	 * the source or the phase changes; a refresh changes neither.
	 */
	follow(): (() => void) | undefined {
		const source = this.source;
		if (this.phase !== 'ready' || !isFollowable(source)) return undefined;
		return source.follow(() => void this.refresh());
	}

	/**
	 * The URL a file of the reading loads from, for the renderer. An arrow
	 * because it is passed as a callback.
	 */
	readonly assetUrl = (path: string): string | null => this.source?.assetUrl(path) ?? null;

	/** The forge page of a file of the reading, or null when the source has none. */
	fileUrl(path: string): string | null {
		const source = this.source;
		if (!isLinked(source)) return null;
		return source.fileUrl(path);
	}

	/** The hover text of a marked row: how it moved, and since when. */
	describeMoves(moves: Movement[]): string {
		return `${moves.join(', ')} since your reading ${describeAge(this.previous?.at ?? 0)}`;
	}

	abort(): void {
		this.#controller?.abort();
		this.#controller = null;
	}
}

function describe(error: unknown): Failure {
	if (error instanceof SourceError) return { kind: error.failure, message: error.message };
	return { kind: 'unknown', message: messageOf(error) };
}

function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	return 'Something went wrong.';
}

/**
 * Formats ages in English. `numeric: 'always'` gives "1 day ago" rather than
 * "yesterday", so every age reads on one scale.
 */
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/**
 * Describes a cache's age for the refresh control: "just now", "12 minutes
 * ago", "3 hours ago". `Intl` formats a number and a unit but does not choose
 * them, so the thresholds live here.
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

/** Names a reference: `owner/name` on a forge, its path otherwise, empty when there is none. */
function nameOf(ref: RepoRef | null): string {
	if (!ref) return '';
	if (!isForgeRef(ref)) return ref.path;
	return formatRepoName(ref);
}
