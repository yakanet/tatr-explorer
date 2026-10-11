/**
 * Every source there is, and what the page asks of the whole list: which source
 * reads a reference, how one of our own addresses reads back, and the source
 * opened for it.
 *
 * Separate from the contract in `contract.ts` so that a source may name the
 * interface without this registry importing it back; each source's class lives
 * in its own folder, and only this module knows the whole list.
 */
import { parseForgePath, wordRef, type RepoRef } from '../repo/ref.ts';
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
 * and nothing rests on it: no two share a word or a host, which the spec keeps
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

/** The key of the source that reads `ref`, or none on a host nothing reads. */
export function sourceIdOf(ref: RepoRef): SourceId | undefined {
	return entryOf(ref)?.id;
}

/** The class of the source that reads `ref`, with its key. */
function entryOf(ref: RepoRef): { id: SourceId; sourceClass: SourceClass } | undefined {
	for (const [id, sourceClass] of Object.entries(SOURCES)) {
		// `Object.entries` widens the keys it reads to strings; they are `SOURCES`'s.
		if (answersTo(sourceClass.address, ref.host)) return { id: id as SourceId, sourceClass };
	}
	return undefined;
}

function answersTo(address: Address, host: string): boolean {
	return wordOf(address) === host || hostsOf(address).includes(host);
}

/** The word an address is, or none for a forge's. */
function wordOf(address: Address): string | undefined {
	if ('word' in address) return address.word;
	return undefined;
}

/** The hosts an address reads, or none for a word. */
function hostsOf(address: Address): readonly string[] {
	if ('hosts' in address) return address.hosts;
	return [];
}

/**
 * Reads the `[...repo]` portion of one of our own URLs: a source's word, or a
 * forge address on any host, so that one on a host nothing reads still opens a
 * page that says so. A word no source owns is no address, as `served` is where
 * no folder is served, a build included.
 */
export function parseRepoPath(path: string): RepoRef | null {
	const word = path.replace(/^\/+|\/+$/g, '');
	if (Object.values(SOURCES).some((sourceClass) => wordOf(sourceClass.address) === word))
		return wordRef(word);
	return parseForgePath(path);
}

/**
 * The source serving `ref`. Throws for a reference nothing reads, as a host
 * nothing reads: that is how the page explains it, and the reading is the only
 * place a source is opened.
 */
export function openSource(ref: RepoRef): Source {
	const entry = entryOf(ref);
	if (!entry) throw new SourceError('unsupported-host', unread(ref.host));
	return entry.sourceClass.open(ref);
}

/** What a host nothing reads is told: which ones are. */
function unread(host: string): string {
	const read = Object.values(SOURCES).flatMap((sourceClass) => hostsOf(sourceClass.address));
	return `Nothing reads ${host} yet: the hosts read are ${read.join(', ')}.`;
}
