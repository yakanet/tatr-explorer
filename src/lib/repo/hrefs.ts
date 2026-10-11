/**
 * The addresses of the views of the repository a reference names. Kept apart
 * from `ref.ts`, which holds pure functions, because `resolve` reads the site's
 * base path.
 */
import { resolve } from '$app/paths';
import { formatRepoPath, type RepoRef } from './ref.ts';

/** The page of the task `id`. */
export function taskHref(ref: RepoRef, id: string): string {
	return resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
}

/** The list view, before any query. */
export function listHref(ref: RepoRef): string {
	return resolve('/[...repo]/list', { repo: formatRepoPath(ref) });
}
