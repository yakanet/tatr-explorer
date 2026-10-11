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
import type { Cached, Linked, Rereadable } from '../capabilities.ts';
import { encodePath, readText } from '../http.ts';
import { SourceError, type Listing, type Source, type SourceKind } from '../source.ts';
import { listViaApi } from './api.ts';
import { listViaUngh } from './ungh.ts';

const RAW = 'https://raw.githubusercontent.com';
/** The forge's own id. */
const NAME = 'github';

/**
 * URL of a file's raw contents. Free of the API budget.
 *
 * The branch is encoded as a path, and for the same reason: a URL carries
 * `feature/web-ui` as two segments, and `feature%2Fweb-ui` is a branch of that
 * literal name, which no repository has.
 */
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
 * One way of listing a repository: a function, there being nothing else to a
 * lister. It asks the network it is handed, so that a repository opened over
 * a substitute lists over it too, and answers null where the repository or the
 * branch does not exist, which the forge then words once for all of them.
 */
export type Lister = (
	ref: RepoRef,
	network: typeof fetch,
	signal?: AbortSignal
) => Promise<Listing | null>;

/** Listers in fallback order, at least one: with none, nothing would be asked. */
export type Listers = readonly [Lister, ...Lister[]];

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
const LISTERS: Listers = [listViaApi, listViaUngh];

/**
 * Lists a repository, falling back through the listers in order.
 *
 * Only the listing can be rate-limited, so a spent budget is answered by asking
 * someone else rather than by an error. A missing repository is missing
 * everywhere, so that one is not retried. And when nobody answered, a spent
 * budget is what is reported, rather than whichever fallback failed last: it
 * is the cause, and the one thing the reader can wait out.
 */
async function listRepository(
	ref: RepoRef,
	listers: Listers,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<Listing> {
	let lastError: unknown;
	let spent: SourceError | undefined;

	for (const lister of listers) {
		let listing: Listing | null;
		try {
			listing = await lister(ref, network, signal);
		} catch (error) {
			if (error instanceof SourceError && error.failure === 'rate-limited') spent = error;
			lastError = error;
			continue;
		}
		// A missing repository is the same everywhere; do not ask the others.
		if (!listing) throw new SourceError('not-found', missing(ref));
		return listing;
	}
	throw spent ?? lastError;
}

/**
 * What a missing repository says. GitHub answers 404 alike for a branch, a
 * repository and a private one, so the three are named together rather than
 * guessed between at the cost of another request.
 */
function missing(ref: RepoRef): string {
	const repository = describe(ref);
	if (ref.branch) {
		return `No branch ${ref.branch} in ${repository}, or no such repository, or it is private.`;
	}
	return `No repository ${repository} on ${ref.host}, or it is private.`;
}

/** What a spec substitutes in a repository: what it would otherwise ask of GitHub. */
export interface Seams {
	/** The network, which the reads and the listers alike go through. */
	network?: typeof fetch;
	/** The listers this forge falls back through, in order. */
	listers?: Listers;
}

/**
 * A repository on a GitHub-shaped forge, as a source.
 *
 * The reference is `HEAD` unless one was named, which is a fact about this
 * forge rather than about sources: both the trees API and raw accept it, so the
 * request that would resolve a default branch by name is never made.
 */
export class GitHubRepository implements Source, Cached, Rereadable, Linked {
	readonly id = NAME;
	// Polite to the CDN while still finishing in well under a second.
	readonly concurrency = 12;
	readonly label: string;
	readonly cacheKey: string;
	readonly #ref: RepoRef;
	readonly #branch: string;
	readonly #network: typeof fetch;
	readonly #listers: Listers;

	constructor(ref: RepoRef, seams: Seams = {}) {
		this.#ref = ref;
		this.#branch = ref.branch ?? 'HEAD';
		this.#network = seams.network ?? fetch;
		this.#listers = seams.listers ?? LISTERS;
		this.label = describe(ref);
		this.cacheKey = repoKey(ref);
	}

	list(signal?: AbortSignal): Promise<Listing> {
		return listRepository(this.#ref, this.#listers, this.#network, signal);
	}

	read(path: string, signal?: AbortSignal): Promise<string | null> {
		return readText(this.#network, this.assetUrl(path), signal);
	}

	assetUrl(path: string): string {
		return rawUrl(this.#ref, this.#branch, path);
	}

	fileUrl(path: string): string {
		return blobUrl(this.#ref, this.#branch, path);
	}

	/**
	 * Read again at the price of one request, which is what the reader is asking
	 * for, and with nothing to prepare: the loader ignores the cache.
	 */
	async reread(): Promise<void> {}
}

/** How a repository reads on screen: `owner/name`, its host being github.com. */
function describe(ref: RepoRef): string {
	return `${ref.owner}/${ref.name}`;
}

export const githubKind = {
	id: NAME,

	// A forge address on any other host parses all the same, and is refused when
	// opened, as a host nothing reads.
	address: { hosts: ['github.com'] },

	describe,

	branches: true,

	cost: {
		listing: 'one request',
		files: 'Task files are read from a CDN and cost no rate limit.'
	},

	open: (ref) => new GitHubRepository(ref)
} satisfies SourceKind;
