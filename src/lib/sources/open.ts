/**
 * Every kind of source, and what the page asks of the whole list: which kind a
 * reference belongs to, how one of our own addresses reads back, and the
 * source that serves it.
 *
 * Separate from the contract in `source.ts` so that a source may name the
 * interface without this registry importing it back; the kinds live with their
 * implementations, and only this module knows the whole list.
 */
import { parseForgePath, wordRef, type RepoRef } from '../repo/ref.ts';
import { githubKind } from './github/kind.ts';
import { localKind } from './local/kind.ts';
import { SERVED } from './served/enabled.ts';
import { servedKind } from './served/kind.ts';
import { SourceError, type Address, type Source, type SourceKind } from './source.ts';

/**
 * Every source there is, by its id: the shape a lookup wants,
 * an id being what a reading carries and what a mark would be picked by.
 *
 * Written out rather than reduced from a list: a duplicate key in a literal is
 * an error the compiler makes, where `{[kind.id]: kind}` over a list would have
 * silently dropped one and left every test iterating the record to pass over
 * the hole. What a literal cannot check is that a key matches the id it stands
 * for, and the spec does that.
 *
 * Frozen, so nothing registers a kind at runtime. Order is the declaration's,
 * and nothing rests on it: no two kinds share a word or a host, which the spec
 * keeps true.
 */
export const KINDS = Object.freeze({
	local: localKind,
	github: githubKind,
	...servedKinds()
} satisfies Record<string, SourceKind>);

/** A kind's id, which is also its key in `KINDS`. */
export type KindId = keyof typeof KINDS;

/**
 * The folder the dev server serves, only when it serves one: a build, and a dev
 * server started without a folder, carry no served source at all.
 */
function servedKinds(): { served?: SourceKind } {
	if (!SERVED) return {};
	return { served: servedKind(SERVED) };
}

/** The kind `ref` belongs to, or none for a forge address on a host nothing reads. */
export function kindOf(ref: RepoRef): SourceKind | undefined {
	return Object.values(KINDS).find((kind) => answersTo(kind.address, ref.host));
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
 * Reads the `[...repo]` portion of one of our own URLs: a kind's word, or a
 * forge address on any host, so that one on a host nothing reads still opens a
 * page that says so. A word no kind owns is no address, as `served` is where
 * no folder is served, a build included.
 */
export function parseRepoPath(path: string): RepoRef | null {
	const word = path.replace(/^\/+|\/+$/g, '');
	if (Object.values(KINDS).some((kind) => wordOf(kind.address) === word)) return wordRef(word);
	return parseForgePath(path);
}

/**
 * The source serving `ref`. Throws for a reference no kind reads, as a host
 * nothing reads: that is how the page explains it, and the reading is the only
 * place a source is opened.
 */
export function openSource(ref: RepoRef): Source {
	const kind = kindOf(ref);
	if (!kind) throw new SourceError('unsupported-host', unread(ref.host));
	return kind.open(ref);
}

/** What a host nothing reads is told: which ones are. */
function unread(host: string): string {
	const read = Object.values(KINDS).flatMap((kind) => hostsOf(kind.address));
	return `Nothing reads ${host} yet: the hosts read are ${read.join(', ')}.`;
}
