/**
 * Moving between branches of the repository being read.
 *
 * Apart from `ref.ts` because it reads where the reader is, which only the
 * running app knows, while everything there is a pure function of its input.
 */
import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { RouteId } from '$app/types';
import { formatRepoPath, type RepoRef } from './ref.ts';

/**
 * Every route under a repository takes `repo`, and the task page the `id`
 * `page.params` already holds, so the current route resolves again with one
 * parameter changed. `resolve` checks parameters against a route named in the
 * source, which this one is not, hence the looser signature.
 */
const again = resolve as (route: RouteId, params: Record<string, string | undefined>) => string;

/**
 * Where the reader is, on another branch: the same view, the same task, the
 * same query. `undefined` is the default branch.
 *
 * The query is read from `page.shallow` when there is one. The list and the
 * board rewrite their address as the reader types, through a shallow `goto`,
 * and `page.url` stays the address the page was reached by.
 */
export function onBranch(ref: RepoRef, branch: string | undefined): string {
	const repo = formatRepoPath({ ...ref, branch });
	const { search } = page.shallow?.url ?? page.url;
	return again(page.route.id ?? '/[...repo]', { ...page.params, repo }) + search;
}
