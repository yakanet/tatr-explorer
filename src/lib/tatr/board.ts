/**
 * Splits tasks into three board columns: backlog, in progress (tagged `scope`)
 * and done.
 *
 * A column per tag would not work: upstream tags are categories (`bug`, `ui`,
 * `tql`), and 11 of the 79 tasks in tsoding/tatr carry several, so a card would
 * appear twice. `scope` is the one tag that means a stage, "currently working
 * on", and upstream task 20260826-200847 proposes tags for a kanban.
 *
 * Cards cannot be dragged: moving one would write to the repository, and this
 * viewer never writes.
 */
import { compareById, compareByPriority, type Task } from './task.ts';

/** The tag upstream uses for "currently working on". */
export const IN_PROGRESS = 'scope';

export type ColumnKey = 'backlog' | 'progress' | 'done';

export interface Column {
	key: ColumnKey;
	name: string;
	/** A plain description of what lands in the column. */
	hint: string;
	/** The tasks that match the query. */
	tasks: Task[];
	/** How many tasks the column holds before the query, so a header can read `3 / 21`. */
	total: number;
}

function columnOf(task: Task): ColumnKey {
	// A closed task goes to done even if still tagged `scope`, so each card
	// lands in exactly one column.
	if (task.closed) return 'done';
	if (task.tags.includes(IN_PROGRESS)) return 'progress';
	return 'backlog';
}

/**
 * Sorts tasks into the three columns.
 *
 * Open tasks go by priority, as `tatr ls` does. Closed tasks go newest first by
 * id, because priority stops mattering once a task is done (upstream task
 * 20260304-115038) and the format holds no modification date.
 */
export function toColumns(
	tasks: readonly Task[],
	/** The query, applied after counting so the totals cover every task. */
	matches: (task: Task) => boolean = () => true
): Column[] {
	const backlog: Task[] = [];
	const progress: Task[] = [];
	const done: Task[] = [];
	const totals = { backlog: 0, progress: 0, done: 0 };

	for (const task of tasks) {
		const key = columnOf(task);
		totals[key] += 1;
		if (!matches(task)) continue;

		if (key === 'done') done.push(task);
		else if (key === 'progress') progress.push(task);
		else backlog.push(task);
	}

	const byPriority = (list: Task[]) =>
		list.toSorted((a, b) => compareByPriority(a, b) || compareById(a, b));

	return [
		{
			key: 'backlog',
			name: 'Backlog',
			hint: 'open, nobody on it',
			tasks: byPriority(backlog),
			total: totals.backlog
		},
		{
			key: 'progress',
			name: 'In progress',
			hint: `tagged :${IN_PROGRESS}`,
			tasks: byPriority(progress),
			total: totals.progress
		},
		{
			key: 'done',
			name: 'Done',
			hint: 'closed, newest first',
			tasks: done.toSorted((a, b) => compareById(b, a)),
			total: totals.done
		}
	];
}
