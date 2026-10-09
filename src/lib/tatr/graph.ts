/**
 * The cross-reference graph: which tasks cite which.
 *
 * Behaviour taken from `graph_run` in `src/tatr.c`, which scans every `TASK.md` for
 * anything shaped like a HUID and keeps the ones naming a folder that exists.
 * That existence check is what does the real work: a task's body also carries
 * the timestamps of its own journal entries, as `NOTE(20260829-201427)`, and
 * those name no task, so they fall away on their own. Nothing here treats an
 * unknown id as a broken link, because the format has no such notion.
 *
 * The reference implementation stops at a Graphviz file. What it cannot do is
 * show a title: `neato` needs short labels, and the upstream task that asked
 * for this graph stalled on exactly that. So the result is grouped by connected
 * component, and each component is drawn with numbered nodes against a legend —
 * a title then has nowhere it needs to fit.
 */
import type { Task } from './task.ts';

/** A citation between two tasks that both exist, drawn once. */
export interface GraphEdge {
	from: string;
	to: string;
	/** True when each task cites the other, so the connection points both ways. */
	mutual: boolean;
}

export interface GraphNode {
	task: Task;
	/** Ids this task cites. */
	out: string[];
	/** Ids that cite this task. */
	in: string[];
	/** Citations touching this task, in either direction. */
	degree: number;
	/** Distinct tasks it is linked to, a mutual citation counting once. */
	neighbours: number;
}

/** Tasks reachable from one another once direction is ignored. */
export interface Cluster {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface ReferenceGraph {
	/** Connected components, largest first. Every cluster has at least one edge. */
	clusters: Cluster[];
	/** Tasks citing nobody and cited by nobody. */
	isolated: Task[];
	/** Directed citations, which is what `tatr graph` writes into its `.dot`. */
	linkCount: number;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Builds the graph of a whole repository.
 *
 * Tasks whose description was dropped by the cache keep working: the ids they
 * cite are extracted when the task is read and travel with it.
 */
export function buildGraph(tasks: readonly Task[]): ReferenceGraph {
	const known = new Map(tasks.map((task) => [task.id, task]));

	const out = new Map<string, string[]>();
	const incoming = new Map<string, string[]>();
	let linkCount = 0;

	for (const task of tasks) {
		const cited = task.references.filter((id) => id !== task.id && known.has(id)).sort();
		if (cited.length === 0) continue;

		out.set(task.id, cited);
		linkCount += cited.length;
		for (const id of cited) {
			const list = incoming.get(id);
			if (list) list.push(task.id);
			else incoming.set(id, [task.id]);
		}
	}

	// One entry per connection rather than per direction: a pair citing each
	// other is a single line on screen, not two arrows on top of one another.
	const edges = new Map<string, GraphEdge>();
	for (const [from, cited] of out) {
		for (const to of cited) {
			const mutual = out.get(to)?.includes(from) ?? false;
			const [a, b] = mutual && to < from ? [to, from] : [from, to];
			edges.set(`${a} ${b}`, { from: a, to: b, mutual });
		}
	}

	const neighbours = new Map<string, Set<string>>();
	const touch = (id: string) => {
		const set = neighbours.get(id);
		if (set) return set;
		const created = new Set<string>();
		neighbours.set(id, created);
		return created;
	};
	for (const edge of edges.values()) {
		touch(edge.from).add(edge.to);
		touch(edge.to).add(edge.from);
	}

	const seen = new Set<string>();
	const clusters: Cluster[] = [];
	for (const id of [...neighbours.keys()].sort()) {
		if (seen.has(id)) continue;

		const members: string[] = [];
		const stack = [id];
		seen.add(id);
		while (stack.length > 0) {
			const current = stack.pop()!;
			members.push(current);
			for (const next of neighbours.get(current) ?? []) {
				if (seen.has(next)) continue;
				seen.add(next);
				stack.push(next);
			}
		}

		const inCluster = new Set(members);
		clusters.push({
			nodes: members
				.map((member) => {
					const task = known.get(member)!;
					const cites = out.get(member) ?? [];
					const cited = (incoming.get(member) ?? []).sort();
					return {
						task,
						out: cites,
						in: cited,
						degree: cites.length + cited.length,
						neighbours: neighbours.get(member)?.size ?? 0
					};
				})
				// Busiest first: the most tasks linked to, then the most citations.
				.sort((a, b) => b.neighbours - a.neighbours || b.degree - a.degree || byId(a.task, b.task)),
			edges: [...edges.values()]
				.filter((edge) => inCluster.has(edge.from))
				.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1))
		});
	}

	clusters.sort(
		(a, b) => b.nodes.length - a.nodes.length || byId(a.nodes[0].task, b.nodes[0].task)
	);

	return {
		clusters,
		isolated: tasks.filter((task) => !neighbours.has(task.id)).sort(byId),
		linkCount
	};
}
