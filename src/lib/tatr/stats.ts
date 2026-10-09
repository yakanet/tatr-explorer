/**
 * Summaries of a set of tasks, for the dashboard.
 *
 * Everything here is derived from the four dimensions the format actually
 * carries: binary status, numeric priority, tags, and the creation date encoded
 * in the HUID. There are no closure dates in a task file, so there can be no
 * burndown, no cycle time and no "closed this month" — the activity series
 * counts *creations*, split by present status. Anything else would be invented.
 */
import type { Task } from './task.ts';

export interface Counts {
	total: number;
	open: number;
	closed: number;
	untagged: number;
}

export function counts(tasks: Task[]): Counts {
	return {
		total: tasks.length,
		open: tasks.filter((task) => !task.closed).length,
		closed: tasks.filter((task) => task.closed).length,
		untagged: tasks.filter((task) => task.tags.length === 0).length
	};
}

export interface PriorityBucket {
	priority: number;
	count: number;
}

/**
 * One row per distinct priority, highest first — not fixed ranges, because a
 * repository's priorities are whatever its author chose.
 */
export function byPriority(tasks: Task[]): PriorityBucket[] {
	const seen = new Map<number, number>();
	for (const task of tasks) seen.set(task.priority, (seen.get(task.priority) ?? 0) + 1);
	return [...seen]
		.map(([priority, count]) => ({ priority, count }))
		.sort((a, b) => b.priority - a.priority);
}

export interface TagCount {
	tag: string;
	count: number;
}

/** Tags by frequency, most used first, ties broken alphabetically. */
export function byTag(tasks: Task[]): TagCount[] {
	const seen = new Map<string, number>();
	for (const task of tasks) {
		for (const tag of task.tags) seen.set(tag, (seen.get(tag) ?? 0) + 1);
	}
	return [...seen]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface MonthBucket {
	/** `YYYY-MM`, in UTC, since HUIDs are UTC. */
	month: string;
	open: number;
	closed: number;
}

/**
 * Creations per month, from the first month that has any through the last —
 * empty months included, because their emptiness is the point. Repositories
 * like this one are written in bursts, and a series that silently skips the
 * quiet months would hide that.
 */
export function byMonth(tasks: Task[]): MonthBucket[] {
	if (tasks.length === 0) return [];

	const key = (date: Date) =>
		`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

	const seen = new Map<string, MonthBucket>();
	for (const task of tasks) {
		const month = key(task.created);
		const bucket = seen.get(month) ?? { month, open: 0, closed: 0 };
		if (task.closed) bucket.closed += 1;
		else bucket.open += 1;
		seen.set(month, bucket);
	}

	const times = tasks.map((task) => task.created.getTime());
	const first = new Date(Math.min(...times));
	const last = new Date(Math.max(...times));

	const out: MonthBucket[] = [];
	const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
	const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1);

	while (cursor.getTime() <= end) {
		const month = key(cursor);
		out.push(seen.get(month) ?? { month, open: 0, closed: 0 });
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return out;
}

/** Tasks a query selected, highest priority first, as `tatr ls` orders them. */
export function topByPriority(tasks: Task[], limit: number): Task[] {
	return tasks
		.toSorted((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
		.slice(0, limit);
}

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/**
 * `2026-03` as `March 2026`, joined by a no-break space: the masthead's
 * sentence is set large enough to wrap, and a month on one line with its year
 * on the next reads as two things.
 */
export function monthName(month: string): string {
	const [year, index] = month.split('-').map(Number);
	return `${MONTH_NAMES[index - 1]}\u00a0${year}`;
}

export interface Summary {
	/** The clause that leads, e.g. "23 tasks still open". */
	lead: string;
	/** The number in the lead, so it can be emphasised on its own. */
	leadCount: number;
	/** The observation that follows, or `null` when nothing stands out. */
	detail: string | null;
}

/**
 * States a repository's condition in a sentence.
 *
 * The dashboard opens by saying something rather than by presenting a row of
 * counters, so this picks the one fact worth leading with. Every candidate is
 * checked against the data — nothing here is a template with a number dropped
 * into it, and when nothing stands out the sentence simply stops.
 *
 * Each clause says what happened rather than what did not: a reader opens a
 * repository to see its work, and the chart below already shows the quiet
 * months. A sleeping repository still says so, as the month its latest task
 * arrived. Each clause also names what it counts: a bare "them" would seem to
 * refer to the open tasks in the lead when the figure is over all of them.
 *
 * This describes a whole repository. Do not call it on a filtered subset: "29
 * were created in August alone" would read as a fact about the repository the
 * masthead names, when it is one about whatever the filter kept.
 */
export function summarise(tasks: Task[], now = new Date()): Summary {
	const { open, closed, total } = counts(tasks);

	const lead =
		total === 0
			? 'No tasks here yet'
			: open === 0
				? `Nothing left open, out of ${total}`
				: `${open} task${open === 1 ? '' : 's'} still open`;

	if (total === 0) return { lead, leadCount: 0, detail: null };

	// Progress first. Not when everything is closed, which the lead already says.
	if (open > 0 && closed * 3 >= total) {
		return {
			lead,
			leadCount: open,
			detail: `${closed} of the ${total} ${closed === 1 ? 'is' : 'are'} already closed`
		};
	}

	// Repositories like this one are written in bursts, and the month that holds
	// a third of everything is the one worth naming — if it stands alone, since a
	// tie has no month to name, and over a span long enough to be a burst in.
	const months = byMonth(tasks);
	const sizes = months.map((month) => month.open + month.closed);
	const most = Math.max(...sizes);
	if (months.length >= 3 && most * 3 >= total && sizes.filter((n) => n === most).length === 1) {
		const busiest = months[sizes.indexOf(most)];
		return {
			lead,
			leadCount: open,
			detail: `${most} were created in ${monthName(busiest.month)} alone`
		};
	}

	// A repository that has gone quiet: the month its latest task arrived, which
	// a reader can place, rather than a duration they would have to count back.
	const last = months[months.length - 1];
	const [year, month] = last.month.split('-').map(Number);
	if ((now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month) >= 3) {
		return { lead, leadCount: open, detail: `the latest arrived in ${monthName(last.month)}` };
	}

	return { lead, leadCount: open, detail: null };
}
