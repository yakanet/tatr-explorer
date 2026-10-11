/**
 * The GitHub API, as one lister.
 *
 * One call to the git trees API returns the entire repository tree, so listing
 * a repository costs exactly one request out of the 60 per hour an
 * unauthenticated IP gets. `HEAD` is accepted as the reference, including on
 * repositories whose default branch is not `main`, which halves that: one
 * request per repository, never two.
 *
 * Measured: a conditional request answering 304 still consumes quota when
 * unauthenticated, so revalidating is not free and the cache is never
 * refreshed behind the reader's back.
 */
import type { RepoRef } from '../../repo/ref.ts';
import { ListingError, type Listing } from '../source.ts';

const API = 'https://api.github.com';
const NAME = 'github';

interface TreeResponse {
	tree?: { path: string; type: string; size?: number }[];
	truncated?: boolean;
}

async function json(network: typeof fetch, url: string, signal?: AbortSignal): Promise<Response> {
	let response: Response;
	try {
		response = await network(url, {
			signal,
			headers: { Accept: 'application/vnd.github+json' }
		});
	} catch {
		throw new ListingError('network', NAME, `Could not reach ${url}`);
	}

	if (response.status === 403 || response.status === 429) {
		const remaining = response.headers.get('x-ratelimit-remaining');
		if (remaining === '0' || response.status === 429) {
			throw new ListingError('rate-limited', NAME, 'GitHub API rate limit reached');
		}
	}
	if (response.status === 404) {
		throw new ListingError('not-found', NAME, 'Repository or branch not found');
	}
	if (!response.ok) {
		throw new ListingError('network', NAME, `GitHub answered ${response.status}`);
	}
	return response;
}

/** Lists a repository through the trees API. */
export async function listViaApi(
	ref: RepoRef,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<Listing> {
	// `HEAD` avoids a second request to learn the default branch's name.
	const branch = ref.branch ?? 'HEAD';
	const response = await json(
		network,
		`${API}/repos/${ref.owner}/${ref.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
		signal
	);
	const body = (await response.json()) as TreeResponse;
	if (!Array.isArray(body.tree)) {
		throw new ListingError('malformed', NAME, 'No tree in the response');
	}
	if (body.truncated) {
		throw new ListingError(
			'malformed',
			NAME,
			'Repository tree is truncated; it is too large to list in one call'
		);
	}

	return {
		entries: body.tree
			.filter((entry) => entry.type === 'blob')
			.map((entry) =>
				entry.size === undefined ? { path: entry.path } : { path: entry.path, size: entry.size }
			),
		branch
	};
}
