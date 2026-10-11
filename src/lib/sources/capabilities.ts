/**
 * What a source may do besides listing and reading: one small interface per
 * capability, and a guard beside each for the views to ask.
 *
 * A view asks whether the source of its reading can do a thing, never which
 * source it holds: that second question is how one source's knowledge leaked
 * into the pages, one test of a reference's host at a time. And a capability is there with every
 * member it needs, or absent, so a source cannot half-declare one: a Refresh
 * with nothing behind it, or a key that means "do not cache".
 *
 * Contract only, as `contract.ts` is: no implementation is imported here.
 */
import type { Source } from './contract.ts';

/**
 * A source whose readings are kept, under this key.
 *
 * The cache exists to protect an API budget, so a source that spends one says
 * where it may be cached. A source that spends none, while pointing at files
 * someone is editing, is not `Cached`, and a stored copy of it never goes
 * stale because there is none.
 */
export interface Cached {
	readonly cacheKey: string;
}

/**
 * A source that can be read again on demand, which is what gives Refresh a
 * meaning.
 *
 * A forge always can, at the price of a request, and has nothing to prepare:
 * its refresh is the loader ignoring the cache. A folder can only where the
 * browser handed over a way back to keep (a handle, or the entry tree of a
 * drop), which `reread` walks again; otherwise the reader has to offer the
 * folder again, and a Refresh button would be a lie.
 */
export interface Rereadable {
	/**
	 * Made ready to be read again, before a refresh. A reading started since
	 * aborts `signal`, and a reread it aborts leaves the source as it was.
	 */
	reread(signal?: AbortSignal): Promise<void>;
}

/**
 * A source that says when what it holds may have changed, until the function
 * `follow` returns is called.
 *
 * A change is answered by the same refresh a click takes, so only a source
 * that can be read again can be followed. Only a folder can tell, kept with a
 * way back or served by the dev server, and only there is reading again free.
 * A forge never follows: every reading spends the reader's budget, which is
 * why its cache never refreshes on its own either.
 */
export interface Followable extends Rereadable {
	follow(onChange: () => void): () => void;
}

/**
 * A source read at one of several branches, which another reference can name
 * instead: the header offers the others.
 */
export interface Branched {
	/** The branch it reads: `HEAD` unless one was named. */
	readonly branch: string;
}

/**
 * A source whose files each have a page somewhere, where their history and
 * their blame are. A folder on the disk has no page anywhere to link to.
 */
export interface Linked {
	fileUrl(path: string): string;
}

/**
 * A source that can replace a file it holds, which is what editing a task is.
 *
 * Whole, and only over `expected`, the text read from `path` before it was
 * changed: a file that moved on disk since is left as it is, rather than an
 * editor's save lost, and the answer is `changed`, for the page to read again.
 * An answer rather than a failure, as a file `read` cannot find is: a write
 * that cannot be made at all throws a `SourceError`. A forge never writes, as
 * that takes an account, and this site asks for none.
 */
export interface Writable {
	write(path: string, text: string, expected: string): Promise<'written' | 'changed'>;
}

/*
 * The guards test what a member holds rather than that it is there, so that a
 * member declared with nothing in it (a key of null, a method left undefined)
 * is no capability at all, as the interfaces mean.
 */

/** What `source` holds under `name`, which the `Source` type does not know of. */
function memberOf(source: Source | null, name: string): unknown {
	if (source === null) return undefined;
	return (source as unknown as Record<string, unknown>)[name];
}

export function isCached(source: Source | null): source is Source & Cached {
	return typeof memberOf(source, 'cacheKey') === 'string';
}

export function isRereadable(source: Source | null): source is Source & Rereadable {
	return typeof memberOf(source, 'reread') === 'function';
}

export function isFollowable(source: Source | null): source is Source & Followable {
	return isRereadable(source) && typeof memberOf(source, 'follow') === 'function';
}

export function isBranched(source: Source | null): source is Source & Branched {
	return typeof memberOf(source, 'branch') === 'string';
}

export function isLinked(source: Source | null): source is Source & Linked {
	return typeof memberOf(source, 'fileUrl') === 'function';
}

export function isWritable(source: Source | null): source is Source & Writable {
	return typeof memberOf(source, 'write') === 'function';
}
