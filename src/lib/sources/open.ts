/**
 * The registry of sources: which source reads a reference, how one of this
 * site's URLs reads back as a reference, and opening the source for it.
 *
 * Only this module imports every source.
 */
import { isForgeRef, parseForgePath, type RepoRef } from '../repo/ref.ts';
import { GitHubRepositorySource } from './github/source.ts';
import { LocalFolderSource } from './local/source.ts';
import { SERVED } from './served/enabled.ts';
import { ServedSource } from './served/source.ts';
import { SourceError, type Address, type Source, type SourceClass } from './contract.ts';

/**
 * Every source's class, by the key that `REOPENERS` and the contract spec's
 * subjects are keyed by too.
 *
 * A literal rather than built from a list, because the compiler rejects a
 * duplicate key in a literal where a list would silently drop one. Frozen, so
 * nothing registers a source at runtime. Order does not matter: no two sources
 * share a path or a host, which the spec checks.
 */
export const SOURCES = Object.freeze({
	local: LocalFolderSource,
	github: GitHubRepositorySource,
	...servedSources()
} satisfies Record<string, SourceClass>);

/** A source's key in `SOURCES`. */
export type SourceId = keyof typeof SOURCES;

/**
 * The served source, only when the dev server serves a folder: a build, or a
 * dev server started without one, has none.
 */
function servedSources(): { served?: SourceClass } {
	if (!SERVED) return {};
	return { served: ServedSource };
}

/** The key of the first source whose address `matches`, or null where none does. */
function sourceWhere(matches: (address: Address) => boolean): SourceId | null {
	for (const [id, sourceClass] of Object.entries(SOURCES)) {
		// `Object.entries` types its keys as strings, but these are `SOURCES` keys.
		if (matches(sourceClass.address)) return id as SourceId;
	}
	return null;
}

/** The path an address is, or none for a forge's. */
function pathOf(address: Address): string | undefined {
	if ('path' in address) return address.path;
	return undefined;
}

/** The hosts an address reads, or none for a path. */
function hostsOf(address: Address): readonly string[] {
	if ('hosts' in address) return address.hosts;
	return [];
}

/**
 * Reads the `[...repo]` part of one of this site's URLs into a reference,
 * naming the source whose path it is or that reads its forge host. A forge
 * address on a host nothing reads is still a reference, with a null source, so
 * that its page can say so; a path no source owns gives null.
 */
export function parseRepoPath(path: string): RepoRef | null {
	const trimmed = path.replace(/^\/+|\/+$/g, '');
	const owner = sourceWhere((address) => pathOf(address) === trimmed);
	if (owner) return { source: owner, path: trimmed };
	const address = parseForgePath(path);
	if (!address) return null;
	return { ...address, source: sourceWhere((known) => hostsOf(known).includes(address.host)) };
}

/**
 * Opens the source for `ref`. A host nothing reads throws a `SourceError`, so
 * the page explains it like any failed reading.
 */
export function openSource(ref: RepoRef): Source {
	const sourceClass = classOf(ref);
	if (sourceClass) return sourceClass.open(ref);
	// A path reference always names a source: `parseRepoPath` gives null for one no source owns.
	if (!isForgeRef(ref)) throw new TypeError(`No source owns /${ref.path}.`);
	throw new SourceError('unsupported-host', unread(ref.host));
}

/** The class of the source `ref` names, or none where it names none. */
function classOf(ref: RepoRef): SourceClass | undefined {
	if (!ref.source) return undefined;
	return SOURCES[ref.source];
}

/** The message for a host nothing reads, listing the hosts that are read. */
function unread(host: string): string {
	const read = Object.values(SOURCES).flatMap((sourceClass) => hostsOf(sourceClass.address));
	return `Nothing reads ${host} yet: the hosts read are ${read.join(', ')}.`;
}
