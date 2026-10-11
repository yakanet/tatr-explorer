/**
 * Lists a repository's files through ungh.cc, a proxy of GitHub's API, when
 * GitHub's own does not answer. ungh calls GitHub with its own credentials, so
 * it spends none of the reader's budget, allows any origin, and returns the
 * full, current tree.
 */
import type { ForgeAddress } from '../../repo/ref.ts';
import { readJson } from '../http.ts';
import { SourceError, type TreeEntry } from '../contract.ts';

const API = 'https://ungh.cc';

interface UnghResponse {
	files?: { path: string; size?: number }[];
}

/**
 * Lists the files of `ref` at `branch`, or returns null when ungh has no such
 * repository or branch.
 */
export async function listViaUnghApi(
	ref: ForgeAddress,
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
