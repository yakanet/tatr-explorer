/**
 * Loading state for one repository. Listing and reading are separate phases,
 * so the UI can tell a rate-limited listing apart from task files streaming in.
 */
import {
	isFollowable,
	isLinked,
	isRereadable,
	isWritable,
	type Writable,
	type WriteAnswer
} from '../sources/capabilities.ts';
import { loadRepository } from '../sources/load.ts';
import { openSource } from '../sources/open.ts';
import { messageOf, SourceError, type Source, type SourceFailure } from '../sources/contract.ts';
import { formatRepoName, isForgeRef, type RepoRef } from '../repo/ref.ts';
import {
	compare,
	snapshot,
	type Changes,
	type Movement,
	type Replaced,
	type Snapshot
} from '../tatr/changes.ts';
import { formatHuid } from '../tatr/huid.ts';
import type { TagDescriptions } from '../tatr/tags-file.ts';
import { EditRefused, editTaskMd, type Edit } from '../tatr/task-file.ts';
import { newTaskMd, type TaskFields } from '../tatr/task-fields.ts';
import { taskPath, type Task } from '../tatr/task.ts';

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
	'not-written': 'not written',
	unknown: 'could not be read'
} satisfies Record<Failure['kind'], string>;

/** What the page says once an edit is over, in one sentence. */
export interface EditNotice {
	text: string;
	/** True when nothing was written, which the page shows as a warning. */
	failed: boolean;
	/** True after a write, which Undo can take back while the file still holds it. */
	undoable: boolean;
}

/** A file a save writes besides the task's own, by its path from the repository root. */
export type FileWrite =
	/**
	 * A file created, such as an image; one there already is not replaced.
	 * `onwritten` hears that it was written, so that a save tried again after a
	 * failure further on does not write it twice.
	 */
	| { path: string; contents: Blob; onwritten?: () => void }
	/** A file rewritten from what it holds, or from null where there is none. */
	| { path: string; rewrite: (before: string | null) => string };

/**
 * The files a save writes besides the task's own, which may lie in the task's
 * folder and so need its id, unknown for a new task until it is created.
 */
export type Extras = (id: string) => FileWrite[];

/** A save of the task's file alone, as a gesture on the board makes. */
const NO_EXTRAS: Extras = () => [];

/** The notice of an edit that was not made. */
function failed(text: string): EditNotice {
	return { text, failed: true, undoable: false };
}

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
	/** Files read so far and in total by the reading under way, zero once it ends. */
	done = $state(0);
	total = $state(0);
	/** The share of the task files read, as a percentage. */
	readonly percent = $derived.by(() => {
		if (this.total === 0) return 0;
		return (this.done / this.total) * 100;
	});
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

	/** What the last edit came to, until another edit or another source replaces it. */
	notice = $state<EditNotice | null>(null);

	#controller: AbortController | null = null;
	/** True once the reader refused to let this page write, until the source is opened again. */
	#refused = $state(false);
	/** The last write, kept for Undo, which writes `before` back over `after`. */
	#written: { id: string; before: string; after: string } | null = null;
	/** The edits under way, run one after another so that two quick gestures do not race. */
	#edits: Promise<unknown> = Promise.resolve();

	/**
	 * The repository's name on screen: the source's label, or the reference's
	 * own name before a source is opened or when none reads it.
	 */
	readonly name = $derived(this.source?.label ?? nameOf(this.ref));

	readonly open = $derived(this.tasks.filter((task) => !task.closed));

	/**
	 * Whether the views offer to edit: the source writes and the reader has not
	 * refused. Where it is false they show no edit control at all, rather than
	 * one that fails.
	 */
	readonly editable = $derived(isWritable(this.source) && !this.#refused);

	/**
	 * What moved since the reader's last reading, or null on a first visit or
	 * when nothing moved. Null rather than an empty result, so a view tests one
	 * thing and never marks a row that did not move. It stands until a later
	 * reading moves something.
	 */
	readonly changes = $derived.by((): Changes | null => {
		if (!this.previous) return null;
		const changes = compare(this.previous, this.tasks);
		if (changes.total > 0) return changes;
		return null;
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
		// What was said or refused about writing concerned the source let go of.
		this.notice = null;
		this.#refused = false;
		this.#written = null;
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
		this.done = 0;
		this.total = 0;
		if (!standing) {
			this.phase = 'listing';
			this.failure = null;
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
					if (controller.signal.aborted) return;
					this.done = done;
					this.total = total;
					if (!standing) this.phase = 'reading';
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
			this.#ended();
		} catch (error) {
			if (controller.signal.aborted) return;
			this.#ended();
			if (standing) {
				// The reading on screen and its comparison stay untouched.
				this.refreshFailure = describe(error);
				return;
			}
			this.failure = describe(error);
			this.phase = 'failed';
		}
	}

	/** Clears what only a reading under way shows: the refresh flag and the file counts. */
	#ended(): void {
		this.refreshing = false;
		this.done = 0;
		this.total = 0;
	}

	/**
	 * Applies `edit` to a task's file as it is on disk now, rather than as the
	 * reading on screen holds it, which may be minutes old, then reads the
	 * repository again. `what` says what the edit did, for the notice. It never
	 * throws: a failure leaves the reading as it was, with a sentence saying why.
	 * `extras` are written once the file is. Resolves to whether the file now
	 * holds the edit and every extra was written.
	 */
	edit(id: string, edit: Edit, what: string, extras = NO_EXTRAS): Promise<boolean> {
		return this.#queue((source) => this.#edit(source, id, edit, what, extras), false);
	}

	/** Writes back the text the last edit replaced, unless the file changed since. */
	undo(): Promise<boolean> {
		return this.#queue((source) => this.#undo(source), false);
	}

	/**
	 * Creates a task holding `fields`, as `tatr new` would and under an id it
	 * reads from the clock, then reads the repository again. It never throws, as
	 * `edit` does not. `extras` are written once the file is. Resolves to the
	 * task's id once its file is created, whatever became of the extras, or to
	 * null when it was not.
	 */
	create(fields: TaskFields, extras = NO_EXTRAS): Promise<string | null> {
		return this.#queue((source) => this.#create(source, fields, extras), null);
	}

	/**
	 * Whether a task can be edited: the views offer to, and its file has the `#`
	 * without which it is never rewritten.
	 */
	canEdit(task: Task): boolean {
		return this.editable && !task.malformed;
	}

	/**
	 * Runs `step` with the source read now, once the edits under way are over,
	 * if that source may still write then: an edit queued before another
	 * repository was opened must not reach it, and a refusal holds. When `step`
	 * throws, it says why and resolves to `failure` instead.
	 */
	#queue<T>(step: (source: Source & Writable) => Promise<T>, failure: T): Promise<T> {
		const source = this.source;
		const run = this.#edits
			.then(() => {
				if (source !== this.source || !isWritable(source) || this.#refused) return failure;
				return step(source);
			})
			.catch((error: unknown) => {
				this.notice = failed(messageOf(error));
				return failure;
			});
		this.#edits = run;
		return run;
	}

	/**
	 * Asks the reader whether this page may write before the walk that comes
	 * ahead of a write, which may outlast the moment a browser asks in. Resolves
	 * to whether the step goes on: allowed, and the source still the one read,
	 * as the question may stay open while another repository is opened.
	 */
	async #asked(source: Source & Writable): Promise<boolean> {
		const allowed = await source.allow();
		if (source !== this.source) return false;
		if (!allowed) this.#refuse();
		return allowed;
	}

	/** Leaves the folder read-only, the reader having refused to let this page write. */
	#refuse(): void {
		this.#refused = true;
		this.notice = failed(
			'Editing was not allowed, so this folder stays read-only until it is opened again.'
		);
	}

	async #edit(
		source: Source & Writable,
		id: string,
		edit: Edit,
		what: string,
		extras: Extras
	): Promise<boolean> {
		if (!(await this.#asked(source))) return false;
		const path = taskPath(id);
		// A folder holds the files of its last walk, so it walks again first.
		if (isRereadable(source)) await source.reread();
		const before = await source.read(path);
		if (source !== this.source) return false;
		if (before === null) {
			this.notice = failed(`${id} could not be read, so nothing was written.`);
			return false;
		}
		let after: string;
		try {
			after = editTaskMd(before, edit);
		} catch (error) {
			if (!(error instanceof EditRefused)) throw error;
			// As for a file that changed under a write: the reading on screen is stale.
			this.notice = failed(`${id}: ${error.message}`);
			await this.refresh();
			return false;
		}
		const files = extras(id);
		if (after === before) {
			// The file already says so: the reading on screen is the stale part.
			if (files.length > 0) {
				// Undo would take back an earlier edit, which this notice is not about.
				this.#written = null;
				return this.#settle(source, 'written', id, what, files);
			}
			this.notice = null;
			await this.refresh();
			return true;
		}
		const answer = await source.write(path, after, before);
		if (answer === 'written') this.#written = { id, before, after };
		return this.#settle(source, answer, id, what, files);
	}

	async #create(
		source: Source & Writable,
		fields: TaskFields,
		extras: Extras
	): Promise<string | null> {
		if (!(await this.#asked(source))) return null;
		const id = formatHuid(new Date());
		if (await holdsFolder(source, id)) return this.#taken(id);
		const answer = await source.write(taskPath(id), newTaskMd(fields), null);
		// A `TASK.md` was made under that id since the listing was read.
		if (answer === 'changed') return this.#taken(id);
		// Undo writes a file back, and has no file to write back here.
		this.#written = null;
		await this.#settle(source, answer, id, 'created', extras(id));
		if (answer !== 'written') return null;
		return id;
	}

	/** Writes each of `files`, and resolves to a sentence for each that was not written, saying why. */
	async #writeAll(source: Source & Writable, files: readonly FileWrite[]): Promise<string[]> {
		const missed: string[] = [];
		for (const file of files) {
			try {
				const why = await writeFile(source, file);
				if (why) missed.push(`${file.path} was not written, ${why}.`);
			} catch (error) {
				missed.push(`${file.path} was not written: ${messageOf(error)}`);
			}
		}
		return missed;
	}

	/** Refuses an id that is taken, in the words of `tatr new`. */
	#taken(id: string): null {
		this.notice = failed(
			`${id} already exists. You are probably creating tasks too fast, or your time is broken.`
		);
		return null;
	}

	async #undo(source: Source & Writable): Promise<boolean> {
		const last = this.#written;
		if (!last) return false;
		this.#written = null;
		const answer = await source.write(taskPath(last.id), last.before, last.after);
		return this.#settle(source, answer, last.id, 'undone');
	}

	/**
	 * Says what a write's answer means, and reads again wherever the disk may
	 * now differ from the screen. `what` says what a write made did. A write made
	 * is followed by `files`. Resolves to whether the write was made, and every
	 * file after it.
	 */
	async #settle(
		source: Source & Writable,
		answer: WriteAnswer,
		id: string,
		what: string,
		files: readonly FileWrite[] = []
	): Promise<boolean> {
		let missed: string[] = [];
		if (answer === 'written') missed = await this.#writeAll(source, files);
		const done = answer === 'written' && missed.length === 0;
		// Another repository is on screen now, which this does not concern.
		if (source !== this.source) return done;
		if (answer === 'refused') {
			this.#refuse();
			return false;
		}
		if (answer === 'changed') {
			this.notice = failed(
				`${id} changed on disk since it was read, so it was left as it is and read again.`
			);
		} else {
			// Undo is offered while the last write can still be taken back.
			this.notice = {
				text: [`${id}: ${what}.`, ...missed].join(' '),
				failed: missed.length > 0,
				undoable: this.#written !== null
			};
		}
		await this.refresh();
		return done;
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

/**
 * Writes one file of a save, created where there is none or rewritten from
 * what it holds, and resolves to why it was not, as a sentence's end, or null.
 */
async function writeFile(source: Source & Writable, file: FileWrite): Promise<string | null> {
	if ('contents' in file) {
		if ((await source.write(file.path, file.contents, null)) !== 'written') {
			return 'as a file is there already';
		}
		file.onwritten?.();
		return null;
	}
	const before = await source.read(file.path);
	if ((await source.write(file.path, file.rewrite(before), before)) === 'written') return null;
	return 'as it changed on disk since it was read';
}

/**
 * Whether the folder of task `id` exists, whatever it holds, which is what
 * `tatr new` refuses. The listing is read fresh, as a folder holds the files of
 * its last walk.
 */
async function holdsFolder(source: Source, id: string): Promise<boolean> {
	if (isRereadable(source)) await source.reread();
	const { entries } = await source.list();
	return entries.some((entry) => entry.path.startsWith(`tasks/${id}/`));
}

function describe(error: unknown): Failure {
	if (error instanceof SourceError) return { kind: error.failure, message: error.message };
	return { kind: 'unknown', message: messageOf(error) };
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
