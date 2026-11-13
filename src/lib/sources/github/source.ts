/**
 * Reads a repository on GitHub: the listing from the API, the files from
 * raw.githubusercontent.com, a CDN with no rate limit. Only the listing spends
 * the reader's 60 requests an hour, so only the listing has a fallback, ungh.
 *
 * A private repository is read with the token its reader gave, kept beside its
 * readings: the listing from the API, the files in one GraphQL request, as the
 * CDN refuses a token. It is never read through ungh, which would learn the
 * name of a private repository, and could only answer that it does not exist.
 */
import {
	formatRepoName,
	parseForgePath,
	repoKey,
	repositoryKey,
	type ForgeAddress,
	type ForgeRef
} from '../../repo/ref.ts';
import type { Authorizable, Branched, Cached, Linked, Rereadable } from '../capabilities.ts';
import { encodePath, readJson, readText } from '../http.ts';
import {
	SourceError,
	type Address,
	type Cost,
	type Listing,
	type Source,
	type TreeEntry
} from '../contract.ts';
import { openStore, type RepoStore, type Token } from '../store.ts';
import { API, askGitHub, listViaGitHubApi } from './github-api.ts';
import { readTaskTexts } from './graphql.ts';
import { listViaUnghApi } from './ungh-api.ts';

const HOST = 'github.com';
const RAW = 'https://raw.githubusercontent.com';

/** Days a token created from `tokenPage` lasts, after which it is asked for again. */
const TOKEN_DAYS = 90;

const ANONYMOUS: Cost = {
	listing: 'one request',
	files: 'Task files are read from a CDN and cost no rate limit.'
};

const PRIVATE: Cost = {
	listing: 'two requests',
	files: 'Task files are read with your token, all in the second request.'
};

export class GitHubRepositorySource
	implements Source, Cached, Rereadable, Linked, Branched, Authorizable
{
	static readonly address: Address = { hosts: [HOST] };

	// The registry passes only references on GitHub's hosts, which are always a ForgeRef.
	static open(ref: ForgeRef): GitHubRepositorySource {
		return new GitHubRepositorySource(ref);
	}

	// Polite to the CDN, and still fast enough to read a repository in under a second.
	readonly concurrency = 12;
	readonly label: string;
	readonly cacheKey: string;
	readonly branch: string;
	readonly #ref: ForgeAddress;
	readonly #network: typeof fetch;
	readonly #store: RepoStore;
	/** The key the token is kept under, the same for every branch. */
	readonly #repository: string;
	/** The token kept, read from the store on first use. */
	#credential: Promise<Token | null> | null = null;
	/** The token once read, for `assetUrl`, which cannot wait for it. */
	#token: Token | null = null;

	/** `network` and `store` let a spec stand in for GitHub and for IndexedDB. */
	constructor(ref: ForgeAddress, network: typeof fetch = fetch, store: RepoStore = openStore()) {
		this.#ref = ref;
		// The trees API and raw both accept `HEAD`, which saves resolving the default branch.
		this.branch = ref.branch ?? 'HEAD';
		this.#network = network;
		this.#store = store;
		this.label = formatRepoName(ref);
		this.cacheKey = repoKey(ref);
		this.#repository = repositoryKey(ref);
	}

	/** What a reading costs: a private one spends the token's budget, not the address's. */
	get cost(): Cost {
		if (this.#token) return PRIVATE;
		return ANONYMOUS;
	}

	credential(): Promise<Token | null> {
		this.#credential ??= this.#store.token(this.#repository).then((token) => {
			this.#token = token;
			return token;
		});
		return this.#credential;
	}

	get tokenPage(): string {
		const { owner, name } = this.#ref;
		const page = new URL(`https://${HOST}/settings/personal-access-tokens/new`);
		// GitHub caps a token's name at 40 characters.
		page.searchParams.set('name', `tatr ${owner}/${name}`.slice(0, 40));
		page.searchParams.set(
			'description',
			`Lets tatr explorer read the tasks of ${owner}/${name}, from your browser.`
		);
		page.searchParams.set('target_name', owner);
		page.searchParams.set('expires_in', String(TOKEN_DAYS));
		page.searchParams.set('contents', 'read');
		return page.href;
	}

	async neighbours(): Promise<string[]> {
		const { host, owner, name } = this.#ref;
		const kept = (await this.#store.tokenKeys()).map(parseForgePath);
		return kept
			.flatMap((other) => {
				if (!other || other.host !== host || other.owner !== owner || other.name === name)
					return [];
				return [other.name];
			})
			.sort();
	}

	async authorize(
		given: { token: string } | { from: string },
		signal?: AbortSignal
	): Promise<void> {
		const value = await this.#given(given);
		const [login, entries] = await Promise.all([
			this.#login(value, signal),
			listViaGitHubApi(this.#ref, this.branch, this.#network, signal, value)
		]);
		if (!entries) throw this.#unseen(login);
		const token = { value, login };
		await this.#store.keepToken(this.#repository, token);
		this.#token = token;
		this.#credential = Promise.resolve(token);
	}

	/**
	 * Asks GitHub's API, then ungh when GitHub fails: ungh promises no uptime, so
	 * the normal path does not depend on it. A 404 from either is final, as ungh
	 * only relays GitHub. When both fail, a spent budget is reported over the last
	 * failure, being the one cause the reader can wait out.
	 */
	async list(signal?: AbortSignal): Promise<Listing> {
		const token = await this.credential();
		if (token) return this.#listPrivate(token, signal);
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

	async read(path: string, signal?: AbortSignal): Promise<string | null> {
		const token = await this.credential();
		if (!token) return readText(this.#network, this.assetUrl(path), signal);
		const { owner, name } = this.#ref;
		const url = `${API}/repos/${owner}/${name}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`;
		return readText(this.#network, url, signal, {
			Authorization: `Bearer ${token.value}`,
			Accept: 'application/vnd.github.raw+json'
		});
	}

	/**
	 * The file on raw.githubusercontent.com, or for a private repository its
	 * address on GitHub, which serves it to a reader signed in there: the CDN
	 * serves a private file to no one without a token.
	 */
	assetUrl(path: string): string {
		if (this.#token) {
			return `https://${HOST}/${this.#ref.owner}/${this.#ref.name}/raw/${this.#at(path)}`;
		}
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
	 * Lists the repository with `token`, and reads its task files along, from
	 * GitHub alone: a failure is reported as it is, without ungh.
	 */
	async #listPrivate(token: Token, signal?: AbortSignal): Promise<Listing> {
		const [entries, texts] = await Promise.all([
			listViaGitHubApi(this.#ref, this.branch, this.#network, signal, token.value),
			readTaskTexts(this.#ref, this.branch, token.value, this.#network, signal)
		]);
		if (!entries) throw this.#unseen(token.login);
		return { entries, branch: this.branch, texts };
	}

	/** The token given, or the one kept for the neighbour named. */
	async #given(given: { token: string } | { from: string }): Promise<string> {
		if ('token' in given) return given.token.trim();
		const kept = await this.#store.token(repositoryKey({ ...this.#ref, name: given.from }));
		if (!kept)
			throw new SourceError('unauthorized', `No token is kept for ${given.from} any more.`);
		return kept.value;
	}

	/** GitHub's 404 to a token: the repository is not among those it reads, or does not exist. */
	#unseen(login: string): SourceError {
		return new SourceError(
			'not-found',
			`The token of ${login} cannot see ${this.label}: tick the repository among those the ` +
				'token reads, on GitHub, or check its name.'
		);
	}

	/** The account a token belongs to, which the header names. */
	async #login(token: string, signal?: AbortSignal): Promise<string> {
		const response = await askGitHub(this.#network, `${API}/user`, { signal, token });
		if (!response) throw new SourceError('unauthorized', 'GitHub knows no account for this token.');
		const user = (await readJson(response, 'GitHub')) as { login?: unknown };
		if (typeof user.login !== 'string') {
			throw new SourceError('malformed', 'GitHub answered with no account for the token.');
		}
		return user.login;
	}

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
