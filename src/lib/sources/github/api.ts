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
import { SourceError, type Listing } from '../source.ts';

const API = 'https://api.github.com';

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
		throw new SourceError('network', `Could not reach ${url}.`);
	}

	if (response.status === 403 || response.status === 429) {
		const remaining = response.headers.get('x-ratelimit-remaining');
		if (remaining === '0' || response.status === 429) {
			throw new SourceError(
				'rate-limited',
				'GitHub allows 60 unauthenticated requests per hour per IP address, and this ' +
					'address has used all of them. Only listing a repository costs any, never ' +
					'reading its tasks, and one read once stays available without spending more.'
			);
		}
	}
	if (response.status === 404) {
		throw new SourceError('not-found', 'GitHub has no such repository or branch.');
	}
	if (!response.ok) {
		throw new SourceError('network', `GitHub answered ${response.status}.`);
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
		throw new SourceError('malformed', 'GitHub answered with no tree in its response.');
	}
	if (body.truncated) {
		throw new SourceError(
			'malformed',
			'GitHub truncated the repository tree: it is too large to list in one call.'
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
