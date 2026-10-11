/**
 * Lists a repository's files through GitHub's git trees API. One recursive call
 * returns the whole tree, so a listing spends one of the 60 requests an hour
 * GitHub allows an unauthenticated address.
 */
import type { ForgeAddress } from '../../repo/ref.ts';
import { readJson } from '../http.ts';
import { SourceError, type TreeEntry } from '../contract.ts';

const API = 'https://api.github.com';

interface TreeResponse {
	tree?: { path: string; type: string; size?: number }[];
	truncated?: boolean;
}

/** The end of both rate-limit messages: what the reader can still do. */
const STILL_FREE =
	'Only listing a repository counts: reading its tasks does not, and a repository ' +
	'already read stays here.';

/**
 * Lists the files of `ref` at `branch`, or returns null when GitHub has no such
 * repository or branch.
 */
export async function listViaGitHubApi(
	ref: ForgeAddress,
	branch: string,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<TreeEntry[] | null> {
	const url = `${API}/repos/${ref.owner}/${ref.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
	const response = await askGitHub(network, url, signal);
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

/** Returns GitHub's response to `url`, or null on a 404. */
async function askGitHub(
	network: typeof fetch,
	url: string,
	signal?: AbortSignal
): Promise<Response | null> {
	let response: Response;
	try {
		response = await network(url, {
			signal,
			headers: { Accept: 'application/vnd.github+json' }
		});
	} catch {
		throw new SourceError('network', `Could not reach ${url}.`);
	}

	const refused = response.status === 403 || response.status === 429;
	if (refused && response.headers.get('x-ratelimit-remaining') === '0') {
		throw new SourceError(
			'rate-limited',
			'GitHub allows each address 60 unauthenticated requests an hour, and this one ' +
				`has used them all. ${STILL_FREE}`
		);
	}
	// A 429 with requests left is GitHub's secondary limit, on requests too close together.
	if (response.status === 429) {
		throw new SourceError(
			'rate-limited',
			`GitHub is turning this address away for now, for asking too often. ${STILL_FREE}`
		);
	}
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new SourceError('network', `GitHub answered ${response.status}.`);
	}
	return response;
}
