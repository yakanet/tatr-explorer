import { error } from '@sveltejs/kit';
import { parseRepoPath } from '#lib/sources/open.ts';
import type { LayoutLoad } from './$types';

// The repository is only known at runtime, so these routes are served by the
// `404.html` fallback and routed on the client.
export const prerender = false;

export const load: LayoutLoad = ({ params }) => {
	const ref = parseRepoPath(params.repo);
	if (!ref) {
		error(404, `Not a repository reference: ${params.repo}`);
	}
	return { ref };
};
