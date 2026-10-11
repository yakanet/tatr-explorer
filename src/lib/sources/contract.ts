/**
 * The interface every source implements, and the error it throws.
 *
 * This module imports no source, so that every source can import it without a
 * cycle.
 */
import type { RepoRef } from '../repo/ref.ts';

/** One file a source holds: its path from the repository root, and its size when known. */
export interface TreeEntry {
	path: string;
	size?: number;
}

/** What `Source.list` returns: every file the source holds. */
export interface Listing {
	entries: TreeEntry[];
	/**
	 * The branch the files were read from. The listing carries it rather than the
	 * `Source`, because a working tree reads its branch from a file,
	 * asynchronously. A source opened at a branch is `Branched`.
	 */
	branch: string;
}

/**
 * Why a reading failed, as one of the cases the page has a heading for.
 * `no-source` is a source with nothing behind it, such as a folder after a
 * reload.
 */
export type SourceFailure =
	| 'rate-limited'
	| 'not-found'
	| 'network'
	| 'unsupported-host'
	| 'malformed'
	| 'no-source'
	| 'no-tasks-folder';

/**
 * The error a reading fails with: a {@link SourceFailure} for the page's
 * heading, and a message for under it. The source writes the message, as only
 * it knows its budget, its fallbacks, or that a reload took its folder back.
 * The loader and the registry throw it too.
 */
export class SourceError extends Error {
	readonly failure: SourceFailure;

	constructor(failure: SourceFailure, message: string) {
		super(message);
		this.name = 'SourceError';
		this.failure = failure;
	}
}

/**
 * What every source does: list its files, read one, and give a URL for one.
 * Anything more is a capability, in `capabilities.ts`.
 */
export interface Source {
	/** The reading's name on the page from the moment it starts, such as `owner/name`. */
	readonly label: string;

	readonly cost: Cost;

	/** How many reads to run at once, to be polite to a CDN. */
	readonly concurrency: number;

	/** Every file the source holds. Throws a {@link SourceError}. */
	list(signal?: AbortSignal): Promise<Listing>;

	/**
	 * One file as text, or null when it cannot be read, so that one unreadable
	 * task is listed as skipped rather than failing the whole load.
	 */
	read(path: string, signal?: AbortSignal): Promise<string | null>;

	/**
	 * A URL for an `<img>` or a link (a raw endpoint, or a `blob:` for a file in
	 * memory), or null when there is no such file.
	 */
	assetUrl(path: string): string | null;
}

/**
 * Which references a source reads: those on its forge hosts, at
 * `[host/]owner/name`, or one path of this site, such as `/local` for a folder
 * on this machine.
 *
 * A list of hosts rather than a pattern, because a self-hosted forge lives on
 * whatever domain its owner chose.
 */
export type Address = { readonly hosts: readonly string[] } | { readonly path: string };

/** What a reading costs, shown while it is taken: the listing, then the files. */
export interface Cost {
	/** Shown beside the listing step, such as `one request` or `from this machine`. */
	readonly listing: string;
	/** Shown under the steps: what reading the files costs. */
	readonly files: string;
}

/**
 * A source's class, as the registry holds it. Its static side reads
 * references, because which class reads one is decided before any instance
 * exists.
 */
export interface SourceClass {
	/** Which references this class reads, so the registry can name it in a parsed URL. */
	readonly address: Address;
	/**
	 * Opens the source for `ref`, from the reference alone. What a spec
	 * substitutes, such as the network, goes to the constructor instead.
	 */
	open(ref: RepoRef): Source;
}
