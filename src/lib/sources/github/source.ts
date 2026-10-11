/**
 * Reads a repository on GitHub: the listing from the API, the files from
 * raw.githubusercontent.com, a CDN with no rate limit. Only the listing spends
 * the reader's 60 requests an hour, so only the listing has a fallback, ungh.
 */
import { formatRepoName, repoKey, type ForgeAddress, type ForgeRef } from '../../repo/ref.ts';
import type { Branched, Cached, Linked, Rereadable } from '../capabilities.ts';
import { encodePath, readText } from '../http.ts';
import {
	SourceError,
	type Address,
	type Listing,
	type Source,
	type TreeEntry
} from '../contract.ts';
import { listViaGitHubApi } from './github-api.ts';
import { listViaUnghApi } from './ungh-api.ts';

const HOST = 'github.com';
const RAW = 'https://raw.githubusercontent.com';

export class GitHubRepositorySource implements Source, Cached, Rereadable, Linked, Branched {
	static readonly address: Address = { hosts: [HOST] };

	// The registry passes only references on GitHub's hosts, which are always a ForgeRef.
	static open(ref: ForgeRef): GitHubRepositorySource {
		return new GitHubRepositorySource(ref);
	}

	// Polite to the CDN, and still fast enough to read a repository in under a second.
	readonly concurrency = 12;
	readonly cost = {
		listing: 'one request',
		files: 'Task files are read from a CDN and cost no rate limit.'
	};
	readonly label: string;
	readonly cacheKey: string;
	readonly branch: string;
	readonly #ref: ForgeAddress;
	readonly #network: typeof fetch;

	/** `network` lets a spec stand in for GitHub. */
	constructor(ref: ForgeAddress, network: typeof fetch = fetch) {
		this.#ref = ref;
		// The trees API and raw both accept `HEAD`, which saves resolving the default branch.
		this.branch = ref.branch ?? 'HEAD';
		this.#network = network;
		this.label = formatRepoName(ref);
		this.cacheKey = repoKey(ref);
	}

	/**
	 * Asks GitHub's API, then ungh when GitHub fails: ungh promises no uptime, so
	 * the normal path does not depend on it. A 404 from either is final, as ungh
	 * only relays GitHub. When both fail, a spent budget is reported over the last
	 * failure, being the one cause the reader can wait out.
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

	/** The file on raw.githubusercontent.com. */
	assetUrl(path: string): string {
		return `${RAW}/${this.#ref.owner}/${this.#ref.name}/${this.#at(path)}`;
	}

	/**
	 * The file's page on GitHub, for its history: the format holds no date, and
	 * dating a task through the API would cost one request per task.
	 */
	fileUrl(path: string): string {
		return `https://${HOST}/${this.#ref.owner}/${this.#ref.name}/blob/${this.#at(path)}`;
	}

	/** Has nothing to prepare: on a refresh, the loader skips the cache. */
	async reread(): Promise<void> {}

	/**
	 * Joins the branch and `path`, encoding each segment apart: GitHub reads
	 * `feature%2Fweb-ui` as a branch of that literal name, not `feature/web-ui`.
	 */
	#at(path: string): string {
		return `${encodePath(this.branch)}/${encodePath(path)}`;
	}

	/**
	 * The not-found message, naming every cause: GitHub answers 404 alike for a
	 * missing branch, a missing repository and a private one.
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
