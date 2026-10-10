/**
 * GitHub as a source. This folder's entry, as `kind.ts` is in every source
 * folder: the file that builds the {@link SourceKind} the registry holds.
 *
 * A forge is what GitHub is, and the rest of this file is what that means: the
 * listers it falls through, its URL shapes, and the reference it reads by
 * default.
 *
 * Both listers are GitHub (its own API, and ungh proxying it), so they are not
 * two sources but one forge's fallback order, which is why they sit in this
 * folder and why the list belongs here rather than inside either of them. A
 * second forge would start with one lister and no fallback.
 *
 * File contents are read from raw.githubusercontent.com, which is a CDN and
 * sends no rate-limit headers at all: 64 files fetched in parallel came back in
 * a fifth of a second when measured. That split (listing is metered, contents
 * are not) is a fact about this forge, not about sources.
 */
import { repoKey, type RepoRef } from '../../repo/ref.ts';
import {
	ListingError,
	type Listing,
	type OpenOptions,
	type Source,
	type SourceKind
} from '../source.ts';
import { listViaApi } from './api.ts';
import { listViaUngh } from './ungh.ts';

const RAW = 'https://raw.githubusercontent.com';
/** The forge's own id, which its primary lister happens to answer to as well. */
const NAME = 'github';

/**
 * Refuses a reference this forge does not serve.
 *
 * Asked once, at the entrance of the fallback chain, rather than by each lister
 * in it: all three read GitHub (its API, a proxy of it, a cache of it), so the
 * host is the forge's business and asking three times said so three times.
 */
function assertHost(ref: RepoRef): void {
	if (ref.host !== 'github.com') {
		throw new ListingError(
			'unsupported-host',
			NAME,
			`${ref.host} is not supported yet: only github.com is`
		);
	}
}

/**
 * Encodes a path one segment at a time, so the slashes between them survive.
 *
 * Branches take the same treatment as paths, and for the same reason: a URL
 * carries `feature/web-ui` as two segments, and `feature%2Fweb-ui` is a branch
 * of that literal name, which no repository has.
 */
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** URL of a file's raw contents. Free of the API budget. */
function rawUrl(ref: RepoRef, branch: string, path: string): string {
	return `${RAW}/${ref.owner}/${ref.name}/${encodePath(branch)}/${encodePath(path)}`;
}

/**
 * A file's page on the forge, where its history and its blame are.
 *
 * This viewer computes no history, and the link is how it gets away with that:
 * the format holds no modification date, and dating tasks through the API costs
 * one request per task against sixty an hour. The forge renders history better
 * than we would anyway, so a reader who wants it is handed over rather than
 * served a guess.
 *
 * `ref.host` rather than a constant, this being the one URL that genuinely
 * lives on the forge's own domain. The path shape is still GitHub's (GitLab
 * spells it `/-/blob/`), which is 20260906-211255's problem, not this one's.
 */
function blobUrl(ref: RepoRef, branch: string, path: string): string {
	return `https://${ref.host}/${ref.owner}/${ref.name}/blob/${encodePath(branch)}/${encodePath(path)}`;
}

/**
 * The listers this forge falls back through, in order. GitHub first so the
 * normal path depends on nobody else; ungh is a mirror *of GitHub*, which is
 * why it belongs to it rather than standing beside it as a source.
 *
 * jsDelivr was a third, and was dropped: it only ever answered when GitHub and
 * ungh had both failed, and it answered with a cached view (63 of this
 * repository's 64 tasks when measured, missing the newest). Two third parties
 * for that last case was more machinery than a reader of task folders needs.
 */
/**
 * One way of listing a repository: a function, there being nothing else to a
 * lister. The name it answers to lives in the failures it throws, which is
 * where provenance is read.
 */
type Lister = (ref: RepoRef, signal?: AbortSignal) => Promise<Listing>;

const LISTERS: Lister[] = [listViaApi, listViaUngh];

/**
 * Lists a repository, falling back through the listers in order.
 *
 * Only the listing can be rate-limited, so a spent budget is answered by asking
 * someone else rather than by an error. A missing repository is missing
 * everywhere, so that one is not retried.
 */
async function listRepository(
	ref: RepoRef,
	options: { listers?: readonly Lister[]; signal?: AbortSignal } = {}
): Promise<Listing> {
	assertHost(ref);
	const listers = options.listers ?? LISTERS;
	let lastError: unknown;

	for (const lister of listers) {
		try {
			return await lister(ref, options.signal);
		} catch (error) {
			// A missing repository is the same everywhere; do not ask the others.
			if (error instanceof ListingError && error.failure === 'not-found') throw error;
			lastError = error;
		}
	}
	throw lastError ?? new Error('No lister could list the repository');
}

/**
 * A repository on a GitHub-shaped forge, as a source.
 *
 * The reference is `HEAD` unless one was named, which is a fact about this
 * forge rather than about sources: both the trees API and raw accept it, so the
 * request that would resolve a default branch by name is never made.
 */
export const githubKind: SourceKind = {
	id: NAME,

	// Any domain for now, which is every host but the local marker: `assertHost`
	// is what actually refuses the others, and refusing them here becomes this
	// method's job once a second forge claims some.
	claims: (ref) => ref.host.includes('.'),

	open(ref: RepoRef, options: OpenOptions = {}): Source {
		const branch = options.branch ?? ref.branch ?? 'HEAD';
		const doFetch = options.fetchImpl ?? fetch;

		return {
			id: NAME,
			label: `${ref.owner}/${ref.name}`,
			cacheKey: repoKey(ref),
			// Polite to the CDN while still finishing in well under a second.
			concurrency: 12,
			// At the price of one request, which is what the reader is asking for.
			repeatable: true,

			list: (signal) => listRepository(ref, { listers: options.listers, signal }),

			async read(path, signal) {
				try {
					const response = await doFetch(rawUrl(ref, branch, path), { signal });
					return response.ok ? await response.text() : null;
				} catch {
					return null;
				}
			},

			assetUrl: (path) => rawUrl(ref, branch, path),
			fileUrl: (path) => blobUrl(ref, branch, path)
		};
	}
};
