/** Tasks for the specs, read through the parser rather than built by hand. */
import { readTask, type Task } from '#lib/tatr/task.ts';

/** A task titled `t`, with the status, priority and tags given. */
export function makeTask(id: string, priority: number, tags: string[] = [], closed = false): Task {
	const text = `# t\n\n- STATUS: ${statusOf(closed)}\n- PRIORITY: ${priority}\n- TAGS: ${tags.join(',')}\n`;
	return readTask(id, text)!;
}

function statusOf(closed: boolean): 'CLOSED' | 'OPEN' {
	if (closed) return 'CLOSED';
	return 'OPEN';
}
