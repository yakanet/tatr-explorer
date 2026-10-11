/**
 * Assembles a task from its folder name and its `TASK.md`, and orders tasks the
 * way the CLI does.
 */
import type { Attachment } from './attachments.ts';
import { parseHuid, scanHuids } from './huid.ts';
import { isClosed, parseTaskMd, readPriority, readStatus, readTags } from './task-md.ts';

/**
 * Lists the task ids mentioned in a `TASK.md`, deduplicated and sorted.
 *
 * Like the reference implementation, it scans the whole file, title and
 * properties included, and keeps anything shaped like an id: bare, as
 * `TASK(...)`, or as a `NOTE(...)` timestamp. `tatr graph` draws an arrow for
 * each, the task's own id included. Only a caller holding the repository can
 * drop timestamps, by keeping ids that name an existing task (see `buildGraph`).
 */
export function extractReferences(taskMd: string): string[] {
	return [...new Set(scanHuids(taskMd))].sort();
}

export interface Task {
	/** Folder name, which is also the creation timestamp. */
	id: string;
	/** `null` when the id's digits form no real instant. */
	created: Date | null;
	/** Team suffix, when the id carries one. */
	suffix?: string;
	title: string;
	/** The raw STATUS value, which may be anything the author wrote. */
	status: string;
	/** True only when the status is exactly `CLOSED`. */
	closed: boolean;
	priority: number;
	tags: string[];
	/** Every property, including keys outside the documented three. */
	properties: Map<string, string>;
	/**
	 * Task ids mentioned anywhere in the file, deduplicated, its own included.
	 * They are extracted at parse time so the graph works from the cache, which
	 * keeps no description.
	 */
	references: string[];
	/**
	 * Other files in the task's folder. The loader fills this in from the listing,
	 * because `readTask` sees only `TASK.md`.
	 */
	attachments?: Attachment[];
	/**
	 * The body. It is absent when the task came from the cache, which stores
	 * metadata only; `loadTaskDescription` fetches it.
	 */
	description?: string;
	/** True when the title line was missing its `#`, which voids the properties. */
	malformed: boolean;
}

/** The path of a task's file from the repository root. */
export function taskPath(id: string): string {
	return `tasks/${id}/TASK.md`;
}

/**
 * Builds a task, or returns `null` when the folder name is not a HUID, because
 * the CLI skips such folders rather than failing.
 */
export function readTask(id: string, taskMd: string): Task | null {
	const huid = parseHuid(id);
	if (!huid) return null;

	const parsed = parseTaskMd(taskMd);
	const task: Task = {
		id: huid.id,
		created: huid.created,
		title: parsed.title,
		status: readStatus(parsed.properties),
		closed: isClosed(parsed.properties),
		priority: readPriority(parsed.properties),
		tags: readTags(parsed.properties),
		properties: parsed.properties,
		references: extractReferences(taskMd),
		description: parsed.description,
		malformed: parsed.malformed
	};
	if (huid.suffix) task.suffix = huid.suffix;
	return task;
}

/** Orders by priority, highest first, the default order of `tatr ls`. */
export function compareByPriority(a: Task, b: Task): number {
	return b.priority - a.priority;
}

/** Orders two ids code unit by code unit, as `strcmp` does, never by locale. */
export function compareIds(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/** Orders by id, which is chronological, as `tatr ls -id` does. */
export function compareById(a: Task, b: Task): number {
	return compareIds(a.id, b.id);
}
