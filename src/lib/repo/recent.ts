/**
 * The repositories to offer on the homepage.
 *
 * A reader who has opened three is far likelier to want a fourth visit than a
 * first one, so the cache is the list — and the counts a card shows are already
 * in it, which means a card costs no request at all. With nothing cached, this
 * project's own repository is offered: it is certain to exist and to follow the
 * layout, since it tracks its own work with tatr.
 *
 * Kept apart from the page so that turning cache rows into cards can be
 * asserted: the parsing of a key, the counting, the fallback and the order.
 */
import { parseRepoPath, type RepoRef } from './ref.ts';

/** Whatever the cache holds that a card needs. Deliberately narrow. */
export interface CachedShape {
	tasks: { closed: boolean }[];
}

export interface Suggestion {
	ref: RepoRef;
	/** Path in our own URLs, which is both the link and the label. */
	path: string;
	total: number;
	open: number;
	/** When it was read, or `null` for the fallback nobody has opened. */
	storedAt: number | null;
}

/** This project's own repository, offered when the cache is empty. */
export const FALLBACK: RepoRef = { host: 'github.com', owner: 'yakanet', name: 'tatr-explorer' };

/**
 * A cache key back into a reference.
 *
 * `repoKey` writes `host/owner/name@branch`, with the branch left empty when
 * there is none — and a branch may itself contain slashes, so the split has to
 * come off the first `@` rather than the last segment.
 */
export function parseKey(key: string): RepoRef | null {
	const at = key.indexOf('@');
	const path = at === -1 ? key : key.slice(0, at);
	const branch = at === -1 ? '' : key.slice(at + 1);
	return parseRepoPath(branch ? `${path}@${branch}` : path);
}

export function toSuggestions(
	rows: readonly { key: string; value: CachedShape; storedAt: number }[],
	format: (ref: RepoRef) => string
): Suggestion[] {
	const found = rows.flatMap((row) => {
		const ref = parseKey(row.key);
		// A key we cannot read back is a row from a scheme we no longer write.
		// Skipping it beats showing a card that leads nowhere.
		if (!ref) return [];
		return [
			{
				ref,
				path: format(ref),
				total: row.value.tasks.length,
				open: row.value.tasks.filter((task) => !task.closed).length,
				storedAt: row.storedAt
			}
		];
	});

	if (found.length > 0) return found;

	return [{ ref: FALLBACK, path: format(FALLBACK), total: 0, open: 0, storedAt: null }];
}
