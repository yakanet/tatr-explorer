/**
 * How the contract every source runs builds GitHub's sources, for the specs:
 * nothing in the application imports this file.
 */
import { afterEach, vi } from 'vitest';
import { parseRepoPath } from '../../repo/ref.ts';
import type { Subject } from '../contract.spec.ts';
import type { Source } from '../source.ts';
import { githubKind } from './kind.ts';

/**
 * GitHub over `tree`, through both of its doors: the trees API that lists it,
 * and the CDN that serves each file. Read when asked, so a change to `tree`
 * is there the next time either door is knocked on. Called with a `this`, it
 * refuses, as the browser's own `fetch` does with any but the window.
 */
function forge(tree: Readonly<Record<string, string>>): typeof fetch {
	return async function (this: unknown, input: RequestInfo | URL) {
		if (this !== undefined) throw new TypeError('Illegal invocation');
		const url = new URL(String(input));
		if (url.hostname === 'api.github.com') {
			const blobs = Object.entries(tree).map(([path, text]) => ({
				path,
				type: 'blob',
				size: text.length
			}));
			return Response.json({ tree: blobs, truncated: false });
		}
		// `/owner/repo/HEAD/tasks/...`: the file's path is what follows the branch.
		const path = decodeURIComponent(url.pathname.split('/').slice(4).join('/'));
		if (!Object.hasOwn(tree, path)) return new Response('not found', { status: 404 });
		return new Response(tree[path]);
	} as typeof fetch;
}

/** A network that does not answer. */
const unreachable = (async () => {
	throw new TypeError('Failed to fetch');
}) as typeof fetch;

/**
 * The listers reach for the global `fetch` rather than the one a source is
 * opened with, so the network is substituted in both places.
 */
function openOver(network: typeof fetch): Source {
	vi.stubGlobal('fetch', network);
	return githubKind.open(parseRepoPath('owner/repo')!, { fetchImpl: network });
}

export function subjects(): Subject[] {
	afterEach(() => vi.unstubAllGlobals());
	return [
		{
			name: 'a repository on GitHub',
			holding: async (tree) => openOver(forge(tree)),
			broken: () => openOver(unreachable)
		}
	];
}
