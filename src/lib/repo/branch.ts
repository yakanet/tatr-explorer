/**
 * Links to another branch of the repository being read. Kept apart from
 * `ref.ts`, which holds pure functions, because it reads the current page.
 */
import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { RouteId } from '$app/types';
import { formatRepoPath, type ForgeRef } from './ref.ts';

/**
 * `resolve` with a looser signature, since the route comes from `page` rather
 * than being named in the source. Every route under a repository takes `repo`,
 * plus the `id` already in `page.params`, so changing `repo` is enough.
 */
const again = resolve as (route: RouteId, params: Record<string, string | undefined>) => string;

/**
 * The current page on another branch, keeping the view, the task and the
 * query; `undefined` is the default branch. The query comes from
 * `page.shallow` when set, because the list and the board update their address
 * through a shallow `goto` while `page.url` keeps the address first reached.
 */
export function onBranch(ref: ForgeRef, branch: string | undefined): string {
	const repo = formatRepoPath({ ...ref, branch });
	const { search } = page.shallow?.url ?? page.url;
	return again(page.route.id ?? '/[...repo]', { ...page.params, repo }) + search;
}
