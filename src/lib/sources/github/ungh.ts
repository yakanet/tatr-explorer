/**
 * ungh.cc as a fallback lister.
 *
 * It proxies the GitHub API with its own credentials, so it imposes no
 * per-visitor budget, sends `access-control-allow-origin: *`, and was measured
 * to return the repository in full (64 of 64 tasks) rather than a late copy.
 *
 * It is a free third-party service with no uptime guarantee, which is why it
 * sits behind GitHub rather than in front of it: the normal path should not
 * depend on someone else's goodwill.
 */
import type { RepoRef } from '../../repo/ref.ts';
import { SourceError, type Listing } from '../source.ts';

const API = 'https://ungh.cc';

interface UnghResponse {
	files?: { path: string; size?: number }[];
}

/** Lists a repository through ungh, which proxies the same API. */
export async function listViaUngh(
	ref: RepoRef,
	network: typeof fetch,
	signal?: AbortSignal
): Promise<Listing> {
	const branch = ref.branch ?? 'HEAD';
	const url = `${API}/repos/${ref.owner}/${ref.name}/files/${encodeURIComponent(branch)}`;

	let response: Response;
	try {
		response = await network(url, { signal });
	} catch {
		throw new SourceError('network', `Could not reach ${url}.`);
	}
	if (response.status === 404) {
		throw new SourceError('not-found', 'ungh has no such repository or branch.');
	}
	if (!response.ok) {
		throw new SourceError('network', `ungh answered ${response.status}.`);
	}

	const body = (await response.json()) as UnghResponse;
	if (!Array.isArray(body.files)) {
		throw new SourceError('malformed', 'ungh answered with no files in its response.');
	}

	return {
		entries: body.files.map((file) =>
			file.size === undefined ? { path: file.path } : { path: file.path, size: file.size }
		),
		// ungh resolves HEAD itself; we only know the branch when it was given.
		branch: ref.branch ?? 'HEAD'
	};
}
