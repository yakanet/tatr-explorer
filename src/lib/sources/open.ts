/**
 * Turns a reference into the source that serves it.
 *
 * Separate from the contract in `source.ts` so that a source may name the
 * interface without this registry importing it back; the kinds live with their
 * implementations, and only this module knows the whole list.
 */
import type { RepoRef } from '../repo/ref.ts';
import { githubKind } from './github/kind.ts';
import { localKind } from './local/kind.ts';
import { SERVED } from '../served.ts';
import { servedKind } from './served/kind.ts';
import { ListingError, type OpenOptions, type Source, type SourceKind } from './source.ts';

/**
 * Every source there is, by the id it answers to: the shape a lookup wants,
 * an id being what a reading carries and what a mark would be picked by.
 *
 * Written out rather than reduced from a list: a duplicate key in a literal is
 * an error the compiler makes, where `{[kind.id]: kind}` over a list would have
 * silently dropped one and left every test iterating the record to pass over
 * the hole. What a literal cannot check is that a key matches the id it stands
 * for, and the spec does that.
 *
 * Frozen, so nothing registers a kind at runtime. Order is the declaration's,
 * and nothing rests on it: the claims are disjoint (the local marker is a host
 * with no dot in it, a forge claims a domain), which `claims nothing twice`
 * keeps true.
 */
export const KINDS = Object.freeze({
	local: localKind,
	github: githubKind,
	...servedKinds()
} satisfies Record<string, SourceKind>);

/**
 * The folder the dev server serves, only when it serves one: a build, and a dev
 * server started without a folder, carry no served source at all.
 */
function servedKinds(): { served?: SourceKind } {
	if (!SERVED) return {};
	return { served: servedKind(SERVED) };
}

/**
 * The source serving `ref`. Throws for a reference no kind claims, as a listing
 * the host cannot serve: that is how the page explains it, and the reading is
 * the only place a source is opened.
 */
export function openSource(ref: RepoRef, options: OpenOptions = {}): Source {
	const kind = Object.values(KINDS).find((candidate) => candidate.claims(ref));
	if (!kind) throw new ListingError('unsupported-host', ref.host, `${ref.host} is not served`);
	return kind.open(ref, options);
}
