/**
 * Builds the cross-reference graph: which tasks cite which.
 *
 * Ported from `graph_run` in `src/tatr.c`, which scans every `TASK.md` for
 * anything shaped like a HUID and keeps the ids naming an existing task folder.
 * That check also drops journal timestamps such as `NOTE(20260829-201427)`,
 * which name no task. An unknown id is not a broken link, because the format
 * has no such notion.
 *
 * `tatr graph` writes a Graphviz file with no titles, because `neato` needs
 * short labels. Here the graph is drawn as stars (`starCards`), each numbered
 * against a list of titles beside it, so a title never has to fit the drawing.
 */
import type { Task } from './task.ts';

/**
 * A citation between two tasks that both exist, drawn once. `from` and `to` are
 * the same task when it cites itself, which `tatr graph` draws too.
 */
export interface GraphEdge {
	from: string;
	to: string;
	/** True when each task cites the other. False for a self-citation, which is one arrow. */
	mutual: boolean;
}

export interface GraphNode {
	task: Task;
	/** Ids this task cites. */
	out: string[];
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
	/** The number of directed citations, as `tatr graph` writes them into its `.dot`. */
	linkCount: number;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Builds the graph of a whole repository. It works on tasks whose description
 * the cache dropped, because cited ids are extracted when a task is read.
 */
export function buildGraph(tasks: readonly Task[]): ReferenceGraph {
	const known = new Map(tasks.map((task) => [task.id, task]));

	const out = new Map<string, string[]>();
	let linkCount = 0;

	for (const task of tasks) {
		const cited = task.references.filter((id) => known.has(id)).sort();
		if (cited.length === 0) continue;

		out.set(task.id, cited);
		linkCount += cited.length;
	}

	// One entry per connection, not per direction, so a pair citing each other
	// draws as one line rather than two overlapping arrows.
	const edges = new Map<string, GraphEdge>();
	for (const [from, cited] of out) {
		for (const to of cited) {
			const mutual = from !== to && (out.get(to)?.includes(from) ?? false);
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
				.map((member) => ({ task: known.get(member)!, out: out.get(member) ?? [] }))
				.sort((a, b) => byId(a.task, b.task)),
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

/** A neighbour of a pivot, and which way the citation between them runs. */
export interface StarLink {
	task: Task;
	/** `in`: it cites the pivot. `out`: the pivot cites it. `both`: each cites the other. */
	kind: 'in' | 'both' | 'out';
}

/** One task and the links drawn around it. Each link appears in one card only. */
export interface StarCard {
	pivot: Task;
	/**
	 * What cites the pivot, then both ways, then what it cites, oldest first
	 * within each. The drawing and its numbered list follow this order.
	 */
	links: StarLink[];
	/** Whether the pivot cites itself, a link with no neighbour to draw. */
	self: boolean;
}

const KIND_ORDER: StarLink['kind'][] = ['in', 'both', 'out'];

/**
 * Splits the graph into star cards, each a pivot with only its own links, so no
 * line in a card crosses another.
 *
 * A card per linked task would draw every link twice, so each link is drawn
 * once: the task with the most links not yet drawn becomes a pivot and takes
 * them all, then the next one takes what is left. A task can still appear as a
 * neighbour in several cards. Ties go to the older task, so the cards stay the
 * same on every visit.
 */
export function starCards(graph: ReferenceGraph): StarCard[] {
	const tasks = new Map<string, Task>();
	const left = new Set<GraphEdge>();
	for (const cluster of graph.clusters) {
		for (const node of cluster.nodes) tasks.set(node.task.id, node.task);
		for (const edge of cluster.edges) left.add(edge);
	}

	const cards: StarCard[] = [];
	while (left.size > 0) {
		const count = new Map<string, number>();
		for (const edge of left) {
			count.set(edge.from, (count.get(edge.from) ?? 0) + 1);
			if (edge.to !== edge.from) count.set(edge.to, (count.get(edge.to) ?? 0) + 1);
		}
		const [pivot] = [...count].sort(([a, m], [b, n]) => n - m || (a < b ? -1 : 1))[0];

		const links: StarLink[] = [];
		let self = false;
		for (const edge of [...left]) {
			if (edge.from !== pivot && edge.to !== pivot) continue;
			left.delete(edge);
			if (edge.from === edge.to) {
				self = true;
				continue;
			}
			const task = tasks.get(edge.from === pivot ? edge.to : edge.from)!;
			links.push({ task, kind: edge.mutual ? 'both' : edge.from === pivot ? 'out' : 'in' });
		}
		links.sort(
			(a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byId(a.task, b.task)
		);
		cards.push({ pivot: tasks.get(pivot)!, links, self });
	}
	return cards;
}
