/**
 * Asks GitHub's REST API, anonymously or with the token a reader gave for a
 * private repository, and lists a repository's files through its git trees
 * API. One recursive call returns the whole tree, so a listing spends one of
 * the 60 requests an hour GitHub allows an unauthenticated address.
 */
import type { ForgeAddress } from '../../repo/ref.ts';
import { readJson } from '../http.ts';
import { SourceError, type TreeEntry } from '../contract.ts';

export const API = 'https://api.github.com';

interface TreeResponse {
	tree?: { path: string; type: string; size?: number }[];
	truncated?: boolean;
}

/** The end of both anonymous rate-limit messages: what the reader can still do. */
const STILL_FREE =
	'Only listing a repository counts: reading its tasks does not, and a repository ' +
	'already read stays here.';

/**
 * Lists the files of `ref` at `branch`, or returns null when GitHub has no such
 * repository or branch, or none that `token` may read.
 */
export async function listViaGitHubApi(
	ref: ForgeAddress,
	branch: string,
	network: typeof fetch,
	signal?: AbortSignal,
	token?: string
): Promise<TreeEntry[] | null> {
	const url = `${API}/repos/${ref.owner}/${ref.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
	const response = await askGitHub(network, url, { signal, token });
	if (!response) return null;

	const body = (await readJson(response, 'GitHub')) as TreeResponse;
	if (!Array.isArray(body.tree)) {
		throw new SourceError('malformed', 'GitHub answered with no tree in its response.');
	}
	if (body.truncated) {
		throw new SourceError(
			'malformed',
			'GitHub truncated the repository tree: it is too large to list in one call.'
		);
	}
	const blobs = body.tree.filter((entry) => entry.type === 'blob');
	return blobs.map(({ path, size }) => ({ path, size }));
}

export interface Asking {
	signal?: AbortSignal;
	/** The reader's token, sent to GitHub's API and to nothing else. */
	token?: string;
	/** What to accept, GitHub's own JSON unless said otherwise. */
	accept?: string;
	/** A body to post, as GraphQL takes its query. */
	body?: string;
}

/** Returns GitHub's response to `url`, or null on a 404. */
export async function askGitHub(
	network: typeof fetch,
	url: string,
	{ signal, token, accept = 'application/vnd.github+json', body }: Asking = {}
): Promise<Response | null> {
	const headers: Record<string, string> = { Accept: accept };
	if (token) headers.Authorization = `Bearer ${token}`;
	let response: Response;
	try {
		response = await network(url, { signal, headers, method: methodOf(body), body });
	} catch {
		throw new SourceError('network', `Could not reach ${url}.`);
	}

	if (response.status === 401) {
		throw new SourceError(
			'unauthorized',
			'GitHub refused the token: it was mistyped, it expired, or it was revoked.'
		);
	}
	const refused = response.status === 403 || response.status === 429;
	if (refused && response.headers.get('x-ratelimit-remaining') === '0') {
		throw new SourceError('rate-limited', spentBudget(token));
	}
	// A 429 with requests left is GitHub's secondary limit, on requests too close together.
	if (response.status === 429) {
		throw new SourceError('rate-limited', turnedAway(token));
	}
	if (response.status === 403 && token) {
		throw new SourceError(
			'unauthorized',
			'The token may not read this repository\'s files: it needs "Contents: read-only".'
		);
	}
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new SourceError('network', `GitHub answered ${response.status}.`);
	}
	return response;
}

/** POST for a request with a body, which only GraphQL sends, GET otherwise. */
function methodOf(body: string | undefined): string {
	if (body === undefined) return 'GET';
	return 'POST';
}

/** The message of a spent hourly budget, which a token raises from 60 to 5000. */
function spentBudget(token: string | undefined): string {
	if (token) return 'The token has used all of the 5000 requests an hour GitHub allows it.';
	return withStillFree(
		'GitHub allows each address 60 unauthenticated requests an hour, and this one has used them all.',
		token
	);
}

function turnedAway(token: string | undefined): string {
	return withStillFree('GitHub is turning this address away for now, for asking too often.', token);
}

/** Says what the reader can still do, which only an anonymous reading can. */
function withStillFree(message: string, token: string | undefined): string {
	if (token) return message;
	return `${message} ${STILL_FREE}`;
}
