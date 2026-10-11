/**
 * What a reading of tasks needs, whatever it is a reading of.
 *
 * The thing worth naming is a *source*, not a forge. A folder on the disk is
 * not a forge and reads tasks perfectly well; a forge is a source that also has
 * URLs, a budget, a branch and an address other people can follow. Naming the
 * interface after the smaller idea is what keeps the local source from being a
 * permanent exception, which is what it was, as a branch in the loader.
 *
 * Contract only: no implementation is imported here, so a source may name this
 * type without anything importing it back.
 */
import type { RepoRef } from '../repo/ref.ts';

/** One file a source holds: a path from the repository root, sometimes a size. */
export interface TreeEntry {
	path: string;
	size?: number;
}

/** What a source answers when asked what it holds. */
export interface Listing {
	entries: TreeEntry[];
	/** The branch the listing was taken from, once resolved. */
	branch: string;
}

/**
 * Why a reading could not be taken, in the vocabulary the page has a heading
 * for: a spent budget, a repository that is not there, a host nothing reads, a
 * source with nothing behind it (a folder after a reload), a folder with no
 * tasks in it.
 *
 * Reading one file never fails this way: one unreadable task is listed as
 * skipped instead of taking the whole load down.
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
 * A reading that could not be taken: why, as a {@link SourceFailure} the page
 * puts a heading on, and the sentence under it, which is the source's to write
 * because only it knows its budget, its fallbacks, or that a reload took its
 * folder back. The loader and the registry throw it too, for what holds
 * whatever the source: a folder with no tasks in it, a host nothing reads.
 * One class, so that a source has one thing to throw and the page one thing to
 * catch.
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
 * What every source does: list what it holds, read a file, and point at one.
 *
 * What a source may do besides (be cached, be read again, be followed, link a
 * file to its page) is a capability of its own, in `capabilities.ts`.
 */
export interface Source {
	/** `github`, `local`. The UI picks a mark by it; nothing else may. */
	readonly id: string;

	/** What the reading calls itself: `owner/name`, or a folder's name. */
	readonly label: string;

	/*
	 * No `branch` here on purpose. A forge captures one when it is opened, and
	 * uses it to build every URL; a working tree reads its own out of a file,
	 * asynchronously, so it could not answer a synchronous member. Which branch
	 * was read is a fact about the *reading*, and {@link Listing} carries it.
	 */

	/**
	 * How many reads at once this source likes: politeness to a CDN, and
	 * nothing at all to a disk.
	 */
	readonly concurrency: number;

	/** Every file it holds, once. Throws a {@link SourceError}. */
	list(signal?: AbortSignal): Promise<Listing>;

	/** One file as text, or null when it cannot be read. */
	read(path: string, signal?: AbortSignal): Promise<string | null>;

	/**
	 * A URL the browser can put in an `<img>` or a link: a raw endpoint, or a
	 * `blob:` for a file already in memory. Null when there is no such file.
	 */
	assetUrl(path: string): string | null;
}

/**
 * Where a kind's sources are found: on the forge hosts it reads, at
 * `[host/]owner/name`, or under one word of its own, for sources no URL anyone
 * else follows can reach (a folder on this machine).
 *
 * A list rather than a pattern, as a self-hosted forge is on whatever domain
 * its owner chose and is named, not guessed.
 */
export type Address = { readonly hosts: readonly string[] } | { readonly word: string };

/** What a reading costs, said while it is taken: the listing, then the files. */
export interface Cost {
	/** Beside the listing step: `one request`, `from this machine`. */
	readonly listing: string;
	/** Under the steps: what reading the files costs, or does not. */
	readonly files: string;
}

/**
 * A kind of source: what is known of it before there is a source, and how one
 * is opened.
 *
 * Recognising a reference is not something an instance can do (it is what
 * decides which instance to build), so it sits one storey up, and so does
 * everything a page needs before a reading exists: how to name the reference,
 * whether it has branches, what reading it will cost.
 */
export interface SourceKind {
	readonly id: string;
	/** Which references it opens; the registry finds a reference's kind by it. */
	readonly address: Address;
	/** How a reference reads on screen, before a reading names it. */
	describe(ref: RepoRef): string;
	/** Whether a reading can be taken at another branch, which the header offers. */
	readonly branches: boolean;
	readonly cost: Cost;
	/**
	 * The source for `ref`, from the reference alone. What a spec substitutes
	 * (the network, a channel) goes to a source's own constructor, each kind
	 * having its own, rather than through every kind's contract.
	 */
	open(ref: RepoRef): Source;
}
