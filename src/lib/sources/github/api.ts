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
import { readJson } from '../http.ts';
import { SourceError, type Listing } from '../source.ts';

const API = 'https://api.github.com';

interface TreeResponse {
	tree?: { path: string; type: string; size?: number }[];
	truncated?: boolean;
}

/** What a spent budget leaves the reader, whichever limit GitHub applied. */
const STILL_FREE =
	'Only listing a repository counts: reading its tasks does not, and a repository ' +
	'already read stays here.';

/** The response to `url`, or null when GitHub has no such repository or branch. */
async function json(
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
	// The other limit, on requests too close together, says nothing of the hour.
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

/** Lists a repository through the trees API. */
export async function listViaApi(
	ref: RepoRef,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<Listing | null> {
	// `HEAD` avoids a second request to learn the default branch's name.
	const branch = ref.branch ?? 'HEAD';
	const response = await json(
		network,
		`${API}/repos/${ref.owner}/${ref.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
		signal
	);
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

	return {
		entries: body.tree
			.filter((entry) => entry.type === 'blob')
			.map((entry) =>
				entry.size === undefined ? { path: entry.path } : { path: entry.path, size: entry.size }
			),
		branch
	};
}
