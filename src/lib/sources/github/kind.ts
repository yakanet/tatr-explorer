/**
 * A repository on GitHub, as a source. This folder's entry, as `kind.ts` is in
 * every source folder: the file that builds the {@link SourceKind} the
 * registry holds.
 *
 * Listing a repository spends the reader's budget of 60 API requests an hour;
 * reading its files does not, as they come from raw.githubusercontent.com, a
 * CDN with no rate limit at all (64 files in a fifth of a second, measured). So
 * the listing has a fallback, ungh, and the files need none.
 */
import { formatRepoName, repoKey, type RepoRef } from '../../repo/ref.ts';
import type { Branched, Cached, Linked, Rereadable } from '../capabilities.ts';
import { encodePath, readText } from '../http.ts';
import {
	SourceError,
	type Listing,
	type Source,
	type SourceKind,
	type TreeEntry
} from '../source.ts';
import { listViaGitHubApi } from './github-api.ts';
import { listViaUnghApi } from './ungh-api.ts';

const HOST = 'github.com';
const RAW = 'https://raw.githubusercontent.com';

export class GitHubRepository implements Source, Cached, Rereadable, Linked, Branched {
	readonly id = 'github';
	// Polite to the CDN while still finishing in well under a second.
	readonly concurrency = 12;
	readonly cost = {
		listing: 'one request',
		files: 'Task files are read from a CDN and cost no rate limit.'
	};
	readonly label: string;
	readonly cacheKey: string;
	readonly branch: string;
	readonly #ref: RepoRef;
	readonly #network: typeof fetch;

	/** `network` is what a spec substitutes for GitHub. */
	constructor(ref: RepoRef, network: typeof fetch = fetch) {
		this.#ref = ref;
		// The trees API and raw both accept `HEAD`, so the request that would
		// resolve a default branch by name is never made.
		this.branch = ref.branch ?? 'HEAD';
		this.#network = network;
		this.label = formatRepoName(ref);
		this.cacheKey = repoKey(ref);
	}

	/**
	 * Asks GitHub's API, then ungh when GitHub would not answer: ungh is a free
	 * third party with no uptime promised, so the normal path does not depend on
	 * it. A repository missing from one is missing from both, so that is not
	 * asked twice. When neither answered, a spent budget is what is reported,
	 * rather than the last failure: it is the cause, and the one thing the
	 * reader can wait out.
	 */
	async list(signal?: AbortSignal): Promise<Listing> {
		const failures: unknown[] = [];
		for (const lister of [listViaGitHubApi, listViaUnghApi]) {
			let entries: TreeEntry[] | null;
			try {
				entries = await lister(this.#ref, this.branch, this.#network, signal);
			} catch (error) {
				failures.push(error);
				continue;
			}
			if (!entries) throw new SourceError('not-found', this.#missing());
			return { entries, branch: this.branch };
		}
		throw failures.find(isSpentBudget) ?? failures.at(-1);
	}

	read(path: string, signal?: AbortSignal): Promise<string | null> {
		return readText(this.#network, this.assetUrl(path), signal);
	}

	/** A file's raw contents, from the CDN that costs no budget. */
	assetUrl(path: string): string {
		return `${RAW}/${this.#ref.owner}/${this.#ref.name}/${this.#at(path)}`;
	}

	/**
	 * A file's page on GitHub, where its history and its blame are. This viewer
	 * computes no history: the format holds no date, and dating a task through
	 * the API would cost a request each, against sixty an hour.
	 */
	fileUrl(path: string): string {
		return `https://${HOST}/${this.#ref.owner}/${this.#ref.name}/blob/${this.#at(path)}`;
	}

	/**
	 * Read again at the price of one request, which is what the reader is asking
	 * for, and with nothing to prepare: the loader ignores the cache.
	 */
	async reread(): Promise<void> {}

	/**
	 * The branch and a path, one segment at a time: a URL carries
	 * `feature/web-ui` as two segments, and `feature%2Fweb-ui` would be a branch
	 * of that literal name, which no repository has.
	 */
	#at(path: string): string {
		return `${encodePath(this.branch)}/${encodePath(path)}`;
	}

	/**
	 * GitHub answers 404 alike for a branch, a repository and a private one, so
	 * the three are named together rather than told apart at another request.
	 */
	#missing(): string {
		if (this.#ref.branch) {
			return `No branch ${this.#ref.branch} in ${this.label}, or no such repository, or it is private.`;
		}
		return `No repository ${this.label} on ${HOST}, or it is private.`;
	}
}

function isSpentBudget(error: unknown): boolean {
	return error instanceof SourceError && error.failure === 'rate-limited';
}

export const githubKind = {
	id: 'github',

	// A forge address on any other host parses all the same, and is refused when
	// opened, as a host nothing reads.
	address: { hosts: [HOST] },

	open: (ref) => new GitHubRepository(ref)
} satisfies SourceKind;
