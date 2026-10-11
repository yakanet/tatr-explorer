/**
 * The repositories the homepage offers: those in the cache, the likeliest to
 * be read again, whose cards cost no request since their counts are cached
 * too. With nothing cached, this project's own repository is offered, since it
 * follows the tatr layout. Kept apart from the page so it can be tested.
 */
import { parseForgePath, repoKey, type ForgeAddress } from './ref.ts';

/** The part of a cache row that a card needs. */
export interface CachedShape {
	tasks: { closed: boolean }[];
}

export interface Suggestion {
	ref: ForgeAddress;
	/** The path in the site's URLs, used as both the link and the label. */
	path: string;
	total: number;
	open: number;
	/** When it was read, or `null` for the fallback nobody has opened. */
	storedAt: number | null;
}

/** This project's own repository, offered when the cache is empty. */
export const FALLBACK: ForgeAddress = {
	host: 'github.com',
	owner: 'yakanet',
	name: 'tatr-explorer'
};

/**
 * The named branches of a repository already in the cache, for the header's
 * branch menu. Asking the forge would spend a rate-limited request before the
 * reader chooses anything. The default branch is left out, since the menu
 * offers it as `HEAD`.
 */
export function branchesOf(ref: ForgeAddress, keys: readonly string[]): string[] {
	// `repoKey` ends the name with `@`, so the prefix cannot match a longer name
	// that starts the same.
	const prefix = repoKey({ ...ref, branch: undefined });
	return keys
		.filter((key) => key.startsWith(prefix) && key !== prefix)
		.map((key) => key.slice(prefix.length))
		.sort();
}

export function toSuggestions(
	rows: readonly { key: string; value: CachedShape; storedAt: number }[],
	format: (ref: ForgeAddress) => string
): Suggestion[] {
	const found = rows.flatMap((row) => {
		// `repoKey` writes a forge path, so parsing it gives the reference back. A
		// key that does not parse comes from an older format, and is skipped
		// rather than shown as a card that leads nowhere.
		const ref = parseForgePath(row.key);
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
