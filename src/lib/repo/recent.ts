/**
 * The repositories to offer on the homepage.
 *
 * A reader who has opened three is far likelier to want a fourth visit than a
 * first one, so the cache is the list, and the counts a card shows are already
 * in it, which means a card costs no request at all. With nothing cached, this
 * project's own repository is offered: it is certain to exist and to follow the
 * layout, since it tracks its own work with tatr.
 *
 * Kept apart from the page so that turning cache rows into cards can be
 * asserted: the parsing of a key, the counting, the fallback and the order.
 */
import { parseForgePath, repoKey, type RepoRef } from './ref.ts';

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
 * The named branches of one repository already in the cache, for the header's
 * branch menu to offer.
 *
 * Asking the forge for its branches is one more request against the hourly
 * budget, spent before the reader has chosen anything; the branches they have
 * read before cost nothing to list, and are the likeliest to be wanted again.
 * The default branch is not among them, the menu offering it as `HEAD`.
 */
export function branchesOf(ref: RepoRef, keys: readonly string[]): string[] {
	// `repoKey` ends the repository at an `@`, so the prefix cannot match a
	// namesake whose name merely starts the same.
	const prefix = repoKey({ ...ref, branch: undefined });
	return keys
		.filter((key) => key.startsWith(prefix) && key !== prefix)
		.map((key) => key.slice(prefix.length))
		.sort();
}

export function toSuggestions(
	rows: readonly { key: string; value: CachedShape; storedAt: number }[],
	format: (ref: RepoRef) => string
): Suggestion[] {
	const found = rows.flatMap((row) => {
		// `repoKey` writes a forge path, so that reading turns a key back into a
		// reference. A key we cannot read back is a row from a scheme we no longer
		// write.
		const ref = parseForgePath(row.key);
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
