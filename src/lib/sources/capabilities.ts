/**
 * What a source may do beyond listing and reading: one interface per
 * capability, each with a guard for the views.
 *
 * A view asks whether its source can do a thing, never which source it is, so
 * that no source's specifics leak into the pages.
 */
import type { Source } from './contract.ts';

/**
 * A source whose readings are cached, under `cacheKey`.
 *
 * The cache protects an API budget, so only a source that spends one is
 * `Cached`. A folder spends none, and a stored copy of files someone is
 * editing would be stale at once.
 */
export interface Cached {
	readonly cacheKey: string;
}

/**
 * A source that can be read again on demand, which is what Refresh needs.
 *
 * A forge always can, and its `reread` has nothing to do: the loader skips the
 * cache. A folder can only when the browser gave a way back to it (a handle,
 * or a drop's entry tree); otherwise the reader has to pick the folder again,
 * and a Refresh button would do nothing.
 */
export interface Rereadable {
	/**
	 * Prepares the source to be read again, before a refresh. A reading started
	 * since aborts `signal`, and an aborted reread leaves the source unchanged.
	 */
	reread(signal?: AbortSignal): Promise<void>;
}

/**
 * A source that reports when its files may have changed, until the function
 * `follow` returns is called.
 *
 * A change triggers the same refresh as a click, so a followed source must be
 * `Rereadable`. Only a folder is followable, because reading it again is free,
 * where every forge reading spends the reader's budget.
 */
export interface Followable extends Rereadable {
	follow(onChange: () => void): () => void;
}

/** A source read at one of several branches; the header offers the others. */
export interface Branched {
	/** The branch it reads: `HEAD` unless one was named. */
	readonly branch: string;
}

/** A source whose files each have a page, with their history and blame. */
export interface Linked {
	fileUrl(path: string): string;
}

/**
 * A source that can replace a file it holds, which is how a task is edited.
 *
 * `write` replaces `path` only while it still holds `expected`, the text read
 * before the edit. Otherwise it answers `changed` and leaves the file alone, so
 * an editor's save is never lost. A write that cannot be made at all throws a
 * `SourceError`. A forge never writes, as that takes an account and this site
 * asks for none.
 */
export interface Writable {
	write(path: string, text: string, expected: string): Promise<'written' | 'changed'>;
}

/**
 * The member `name` of `source`, which the `Source` type does not declare.
 * The guards test its value rather than its presence, so that a member
 * declared empty (a null key, an undefined method) is no capability.
 */
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
