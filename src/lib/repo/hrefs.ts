/**
 * The addresses of the views of the repository a reference names. Kept apart
 * from `ref.ts`, which holds pure functions, because `resolve` reads the site's
 * base path.
 */
import { resolve } from '$app/paths';
import type { Task } from '../tatr/task.ts';
import { formatRepoPath, type RepoRef } from './ref.ts';

/** The page of the task `id`. */
export function taskHref(ref: RepoRef, id: string): string {
	return resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
}

/**
 * The link for a task id found in the text of task `self`. Only ids of other
 * tasks in `tasks` become links: an unknown id would lead to `No such task`,
 * and the task's own id to its own page. The References panel uses the same
 * list, so the body links what it lists.
 */
export function taskLinks(
	ref: RepoRef,
	tasks: readonly Task[],
	self: string
): (id: string) => string | null {
	return (id) => {
		if (id !== self && tasks.some((task) => task.id === id)) return taskHref(ref, id);
		return null;
	};
}

/**
 * The sheet of a new task: `task/new`, which no task id can be, rather than
 * `new`, which a repository can be named.
 */
export function newTaskHref(ref: RepoRef): string {
	return resolve('/[...repo]/task/new', { repo: formatRepoPath(ref) });
}

/** The list view, before any query. */
export function listHref(ref: RepoRef): string {
	return resolve('/[...repo]/list', { repo: formatRepoPath(ref) });
}
