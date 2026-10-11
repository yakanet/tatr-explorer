import { error } from '@sveltejs/kit';
import { parseRepoPath } from '#lib/sources/open.ts';
import type { LayoutLoad } from './$types';

// These routes are not prerendered because the repository is only known at
// runtime: the `404.html` fallback serves them and the client routes them.
export const prerender = false;

export const load: LayoutLoad = ({ params }) => {
	const ref = parseRepoPath(params.repo);
	if (!ref) {
		error(404, `Not a repository reference: ${params.repo}`);
	}
	return { ref };
};
