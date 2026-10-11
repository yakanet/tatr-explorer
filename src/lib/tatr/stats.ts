/**
 * Summarises a set of tasks for the dashboard.
 *
 * Everything comes from what the format carries: status, priority, tags, and
 * the creation date in the HUID. A task file holds no closure date, so there is
 * no burndown or cycle time, and the activity series counts creations split by
 * current status.
 */
import { counted, plural } from '../plural.ts';
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
 * Counts tasks per distinct priority, highest first, rather than in fixed
 * ranges, because each repository picks its own priorities.
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

/** Counts tasks per tag, most used first, ties broken alphabetically. */
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

function isDated(task: Task): task is Task & { created: Date } {
	return task.created !== null;
}

/**
 * Counts creations per month, from the first month with any to the last,
 * including empty months, because repositories are written in bursts and
 * skipping the quiet months would hide that.
 *
 * A task whose id is no real instant has no month, so it is left out here and
 * counted everywhere else.
 */
export function byMonth(tasks: Task[]): MonthBucket[] {
	const dated = tasks.filter(isDated);
	if (dated.length === 0) return [];

	const key = (date: Date) =>
		`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

	const seen = new Map<string, MonthBucket>();
	for (const task of dated) {
		const month = key(task.created);
		const bucket = seen.get(month) ?? { month, open: 0, closed: 0 };
		if (task.closed) bucket.closed += 1;
		else bucket.open += 1;
		seen.set(month, bucket);
	}

	const times = dated.map((task) => task.created.getTime());
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

/** Returns the first `limit` tasks, highest priority first, as `tatr ls` orders them. */
export function topByPriority(tasks: Task[], limit: number): Task[] {
	return tasks
		.toSorted((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
		.slice(0, limit);
}

// In English, as is all of the site's copy, whatever the reader's language.
const LONG_MONTH = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' });

/** The first instant of a month written `2026-03`, in UTC as the ids are. */
function startOf(month: string): Date {
	const [year, index] = month.split('-').map(Number);
	return new Date(Date.UTC(year, index - 1));
}

/**
 * Formats `2026-03` as `March 2026`, joined by a no-break space so the summary
 * never wraps a month away from its year.
 */
export function monthName(month: string): string {
	return `${LONG_MONTH.format(startOf(month))}\u00a0${month.slice(0, 4)}`;
}

export interface Summary {
	/** The clause that leads, e.g. "23 tasks still open". */
	lead: string;
	/** The number in the lead, so it can be emphasised on its own. */
	leadCount: number;
	/** The observation that follows, or `null` when nothing stands out. */
	detail: string | null;
}

function leadClause(open: number, total: number): string {
	if (total === 0) return 'No tasks here yet';
	if (open === 0) return `Nothing left open, out of ${total}`;
	return `${counted(open, 'task', 'tasks')} still open`;
}

/**
 * States a repository's condition in one sentence: a lead clause, then the one
 * fact that stands out, if any.
 *
 * Each clause says what happened rather than what did not, since the chart
 * already shows the quiet months. Each clause names what it counts, since a
 * bare "them" would seem to refer to the open tasks in the lead.
 *
 * Call it on a whole repository only: on a filtered subset, "29 were created in
 * August alone" would read as a fact about the repository the summary names.
 */
export function summarise(tasks: Task[], now = new Date()): Summary {
	const { open, closed, total } = counts(tasks);
	const lead = leadClause(open, total);

	if (total === 0) return { lead, leadCount: 0, detail: null };

	// Progress comes first, unless everything is closed, which the lead already says.
	if (open > 0 && closed * 3 >= total) {
		return {
			lead,
			leadCount: open,
			detail: `${closed} of the ${total} ${plural(closed, 'is', 'are')} already closed`
		};
	}

	// Repositories are written in bursts, so a month holding a third of all tasks
	// is worth naming. A tie has no single month to name, and fewer than three
	// months are too short a span for a burst.
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

	// A quiet repository names the month of its latest task, which a reader can
	// place, rather than a duration to count back from today.
	const last = months[months.length - 1];
	const start = startOf(last.month);
	const elapsed =
		(now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth();
	if (elapsed >= 3) {
		return { lead, leadCount: open, detail: `the latest arrived in ${monthName(last.month)}` };
	}

	return { lead, leadCount: open, detail: null };
}
