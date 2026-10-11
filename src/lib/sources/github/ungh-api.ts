/**
 * ungh.cc, a proxy of GitHub's API, as the lister GitHub falls back on.
 *
 * It asks GitHub with its own credentials, so it imposes no per-visitor budget,
 * sends `access-control-allow-origin: *`, and was measured to return the
 * repository in full (64 of 64 tasks) rather than a late copy.
 */
import type { RepoRef } from '../../repo/ref.ts';
import { readJson } from '../http.ts';
import { SourceError, type TreeEntry } from '../source.ts';

const API = 'https://ungh.cc';

interface UnghResponse {
	files?: { path: string; size?: number }[];
}

/**
 * The files of a repository at `branch`, through ungh, or null when it has no
 * such repository or branch.
 */
export async function listViaUnghApi(
	ref: RepoRef,
	branch: string,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<TreeEntry[] | null> {
	const url = `${API}/repos/${ref.owner}/${ref.name}/files/${encodeURIComponent(branch)}`;

	let response: Response;
	try {
		response = await network(url, { signal });
	} catch {
		throw new SourceError('network', `Could not reach ${url}.`);
	}
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new SourceError('network', `ungh answered ${response.status}.`);
	}

	const body = (await readJson(response, 'ungh')) as UnghResponse;
	if (!Array.isArray(body.files)) {
		throw new SourceError('malformed', 'ungh answered with no files in its response.');
	}
	return body.files.map(({ path, size }) => ({ path, size }));
}
