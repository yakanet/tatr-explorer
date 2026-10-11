/**
 * Compares two readings of one repository to show what moved since the reader
 * last looked.
 *
 * Both readings are already in memory, so the comparison costs no request. It
 * sees only the metadata the cache keeps, so a rewritten title or description
 * is not reported. `tatr` keeps no earlier state, so there is no CLI behaviour
 * to match here.
 */
import type { Task } from './task.ts';

/** The task metadata of a repository as the reader last saw it. */
export interface Snapshot {
	/** When it was read, in epoch milliseconds. */
	at: number;
	tasks: { id: string; closed: boolean; priority: number; tags: string[] }[];
}

/**
 * How one task moved, spelled as the word its badge shows so no lookup table is
 * needed. A task can move in several ways at once, so it carries a list.
 */
export type Movement = 'new' | 'closed' | 'reopened' | 'repriorised' | 'retagged' | 'gone';

export interface Changes {
	/** When the state being compared against was read. */
	since: number;
	/** Every task that moved, and how, keyed by task id. */
	moved: Map<string, Movement[]>;
	/** How many tasks moved, each counted once. */
	total: number;
}

/** Compares tags as sets, because reordering tags is not a change worth announcing. */
function sameTags(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	// A comma cannot appear in a tag, since the format splits on it.
	return a.toSorted().join(',') === b.toSorted().join(',');
}

/** Takes the snapshot that a later reading is compared with. */
export function snapshot(tasks: readonly Task[], at: number): Snapshot {
	return {
		at,
		tasks: tasks.map(({ id, closed, priority, tags }) => ({ id, closed, priority, tags }))
	};
}

/** A reading being replaced: the snapshot on screen, and the one it was compared with. */
export interface Replaced {
	shown: Snapshot;
	previous: Snapshot | null;
}

/**
 * Returns the snapshot a new reading is compared with: the one it replaces,
 * unless both hold the same metadata.
 *
 * In that case the current comparison is kept, so a reading that moved nothing
 * (the page regaining focus, an editor's swap file, a prose-only save, a forge
 * refresh with no news) does not wipe the badges of the last real change.
 */
export function comparedWith(
	replaced: Replaced | null | undefined,
	tasks: readonly Task[]
): Snapshot | null {
	if (!replaced) return null;
	if (compare(replaced.shown, tasks).total === 0) return replaced.previous;
	return replaced.shown;
}

/** Lists what moved from `before` to the tasks as they are now. */
export function compare(before: Snapshot, after: readonly Task[]): Changes {
	// Tasks found again are removed, so what remains is gone.
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
			// A task that arrives already closed is only new: it has no earlier state
			// to move from.
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
