/**
 * Every source there is, and what the page asks of the whole list: which source
 * reads a reference, how one of our own addresses reads back, and the source
 * opened for it.
 *
 * Separate from the contract in `contract.ts` so that a source may name the
 * interface without this registry importing it back at runtime; each source's class lives
 * in its own folder, and only this module knows the whole list.
 */
import { isForgeRef, parseForgePath, type RepoRef } from '../repo/ref.ts';
import { GitHubRepositorySource } from './github/source.ts';
import { LocalFolderSource } from './local/source.ts';
import { SERVED } from './served/enabled.ts';
import { ServedSource } from './served/source.ts';
import { SourceError, type Address, type Source, type SourceClass } from './contract.ts';

/**
 * Every source's class, by its key: the key the page's own tables
 * (`REOPENERS`) and the contract's subjects are keyed by.
 *
 * Written out rather than reduced from a list: a duplicate key in a literal is
 * an error the compiler makes, where building it from a list would have
 * silently dropped one and left every test iterating the record to pass over
 * the hole.
 *
 * Frozen, so nothing registers a source at runtime. Order is the declaration's,
 * and nothing rests on it: no two share a path or a host, which the spec keeps
 * true.
 */
export const SOURCES = Object.freeze({
	local: LocalFolderSource,
	github: GitHubRepositorySource,
	...servedSources()
} satisfies Record<string, SourceClass>);

/** A source's key in `SOURCES`. */
export type SourceId = keyof typeof SOURCES;

/**
 * The folder the dev server serves, only when it serves one: a build, and a dev
 * server started without a folder, carry no served source at all.
 */
function servedSources(): { served?: SourceClass } {
	if (!SERVED) return {};
	return { served: ServedSource };
}

/** The key of the first source whose address `matches`, or null where none does. */
function sourceWhere(matches: (address: Address) => boolean): SourceId | null {
	for (const [id, sourceClass] of Object.entries(SOURCES)) {
		// `Object.entries` widens the keys it reads to strings; they are `SOURCES`'s.
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
 * Reads the `[...repo]` portion of one of our own URLs into a reference, and
 * names the source that reads it: the one whose path it is, or the one that
 * reads a forge address's host. A forge address on a host nothing reads is a
 * reference all the same, with no source, so that it opens a page that says
 * so; a path no source owns is none, as `served` is where no folder is served,
 * a build included.
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
 * The source serving `ref`. Throws for a reference nothing reads, as a host
 * nothing reads: that is how the page explains it, and the reading is the only
 * place a source is opened.
 */
export function openSource(ref: RepoRef): Source {
	const sourceClass = classOf(ref);
	if (sourceClass) return sourceClass.open(ref);
	// Only a forge's reference names no source: a path is read only where one owns it.
	if (!isForgeRef(ref)) throw new TypeError(`No source owns /${ref.path}.`);
	throw new SourceError('unsupported-host', unread(ref.host));
}

/** The class of the source `ref` names, or none where it names none. */
function classOf(ref: RepoRef): SourceClass | undefined {
	if (!ref.source) return undefined;
	return SOURCES[ref.source];
}

/** What a host nothing reads is told: which ones are. */
function unread(host: string): string {
	const read = Object.values(SOURCES).flatMap((sourceClass) => hostsOf(sourceClass.address));
	return `Nothing reads ${host} yet: the hosts read are ${read.join(', ')}.`;
}
