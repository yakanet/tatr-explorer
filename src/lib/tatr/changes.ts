/**
 * What moved between two readings of one repository.
 *
 * The cache holds the state the reader last saw and a refresh replaces it, so
 * keeping the old one for the length of a comparison answers the question a
 * reader actually arrives with: what happened since I last looked? It costs no
 * request: both states are already on the machine, which is what the cache
 * never expiring on its own buys back.
 *
 * The comparison sees only what the cache keeps, which is metadata. A rewritten
 * title or description is invisible here, and announcing otherwise would be a
 * claim the storage cannot back.
 *
 * `tatr` cannot answer this at all: it reads a folder as it stands and holds no
 * memory of how it stood, so there is no behaviour here to diverge from.
 */
import type { Task } from './task.ts';

/** A repository as the reader last saw it: metadata only, by design. */
export interface Snapshot {
	/** When they saw it, in epoch milliseconds. */
	at: number;
	tasks: { id: string; closed: boolean; priority: number; tags: string[] }[];
}

/**
 * How one task moved, spelled as the word a badge shows (the only place these
 * are ever read), so naming them anything else would only buy a lookup table to
 * keep in step.
 *
 * A task can move in more than one way at once, closed and repriorised in the
 * same commit, which is why it carries a list of these rather than one.
 */
export type Movement = 'new' | 'closed' | 'reopened' | 'repriorised' | 'retagged' | 'gone';

export interface Changes {
	/** When the state being compared against was read. */
	since: number;
	/** Every task that moved, and how. Keyed for a view to ask about one row. */
	moved: Map<string, Movement[]>;
	/**
	 * How many tasks moved, each counted once, which is only ever asked as
	 * "did anything?", the answer being on the rows themselves.
	 */
	total: number;
}

/** Tags as a set: a reordered list is not a change worth announcing. */
function sameTags(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	// A comma cannot appear in a tag, the format splitting on it. And unlike the
	// NUL that first stood here, it does not make git read this file as binary.
	return a.toSorted().join(',') === b.toSorted().join(',');
}

/** Takes the snapshot to compare against later. Metadata only, by design. */
export function snapshot(tasks: readonly Task[], at: number): Snapshot {
	return {
		at,
		tasks: tasks.map(({ id, closed, priority, tags }) => ({ id, closed, priority, tags }))
	};
}

/** What moved from `before` to the tasks as they are now. */
export function compare(before: Snapshot, after: readonly Task[]): Changes {
	// Emptied as tasks are found again, so what stays behind is what is gone.
	const missing = new Map(before.tasks.map((task) => [task.id, task]));
	const moved = new Map<string, Movement[]>();

	const record = (id: string, kind: Movement) => {
		const kinds = moved.get(id);
		if (kinds) kinds.push(kind);
		else moved.set(id, [kind]);
	};

	for (const task of after) {
		const was = missing.get(task.id);
		if (!was) {
			// Nothing to have moved from, so a task that arrives already closed is
			// new rather than new *and* closed.
			record(task.id, 'new');
			continue;
		}
		missing.delete(task.id);
		if (was.closed !== task.closed) record(task.id, task.closed ? 'closed' : 'reopened');
		if (was.priority !== task.priority) record(task.id, 'repriorised');
		if (!sameTags(was.tags, task.tags)) record(task.id, 'retagged');
	}

	for (const id of missing.keys()) record(id, 'gone');

	return { since: before.at, moved, total: moved.size };
}
