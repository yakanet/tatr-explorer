<script lang="ts">
	import { getContext } from 'svelte';
	import { resolve } from '$app/paths';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { renderInline } from '#lib/render/markdown.ts';
	import { buildGraph, type Cluster } from '#lib/tatr/graph.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	// Citations are history, like the calendar on the overview: a closed task that
	// answered an open one is exactly what the reader is looking for.
	const graph = $derived(buildGraph(repo.tasks));

	const NODE_R = 13;
	/**
	 * The middle of a star is drawn slightly larger, and not only because it is
	 * the hub: every arrow in a star converges on it, and their heads need
	 * somewhere to land without piling up. A little more rim goes a long way.
	 */
	const HUB_R = 15;
	/**
	 * How much bigger than its own units a drawing is allowed to render. The box
	 * is sized to its contents, so pinning the scale is what keeps a node the
	 * same size on a two-node card and on an eight-node one.
	 */
	const SCALE = 1.4;
	/** Node diameter plus the breathing room two neighbours need between them. */
	const SPACING = 2 * NODE_R + 16;
	/** Ring radius floor, so a satellite never crowds the node in the middle. */
	const RING_MIN = HUB_R + NODE_R + 24;

	interface Point {
		x: number;
		y: number;
		r: number;
	}

	/**
	 * Where each node sits, and how tall the drawing has to be.
	 *
	 * Small components are laid out exactly rather than simulated: a pair on a
	 * line, three or four evenly around a circle. Nothing to relax, nothing to
	 * settle, and the same picture on every visit.
	 *
	 * Past four, a component is in practice a star — one task everything else
	 * answers — so the busiest goes in the middle and the rest ring it. The ring
	 * is sized from the number of satellites rather than fixed, because a radius
	 * that suits five nodes has them overlapping at eight.
	 */
	function layout(count: number): { points: Point[]; width: number; height: number } {
		if (count === 1) {
			return { points: [{ x: 48, y: 48, r: NODE_R }], width: 96, height: 96 };
		}
		if (count === 2) {
			return {
				points: [
					{ x: 62, y: 48, r: NODE_R },
					{ x: 178, y: 48, r: NODE_R }
				],
				width: 240,
				height: 96
			};
		}

		const centred = count >= 5;
		const onRing = centred ? count - 1 : count;
		// Chord between neighbours is 2·r·sin(π/n); solve it for the spacing we need.
		const ring = Math.max(centred ? RING_MIN : 44, SPACING / 2 / Math.sin(Math.PI / onRing));
		const size = 2 * (ring + NODE_R + 6);
		const centre = size / 2;

		const points = Array.from({ length: onRing }, (_, i) => {
			const angle = -Math.PI / 2 + (i * 2 * Math.PI) / onRing;
			return {
				x: centre + ring * Math.cos(angle),
				y: centre + ring * Math.sin(angle),
				r: NODE_R
			};
		});

		return {
			points: centred ? [{ x: centre, y: centre, r: HUB_R }, ...points] : points,
			width: size,
			height: size
		};
	}

	const HEAD_LENGTH = 7;
	const HEAD_WIDTH = 5.5;

	/**
	 * A triangle pointing at `at`, arriving along the unit vector (ux, uy), plus
	 * the coordinate where the line feeding it should stop.
	 *
	 * Drawn as a polygon of our own rather than an SVG `marker`: a marker is
	 * placed by `refX` inside its own scaled viewBox and sized in multiples of the
	 * stroke width, which makes "the tip touches the circle" a guess. Here the tip
	 * is a coordinate.
	 */
	function head(at: Point, ux: number, uy: number) {
		const tipX = at.x - ux * (at.r + 1);
		const tipY = at.y - uy * (at.r + 1);
		const baseX = tipX - ux * HEAD_LENGTH;
		const baseY = tipY - uy * HEAD_LENGTH;
		// Perpendicular to the direction, for the two back corners.
		const px = -uy * (HEAD_WIDTH / 2);
		const py = ux * (HEAD_WIDTH / 2);
		return {
			// Just inside the base: a line running under the head would show
			// through its edges.
			x: baseX + ux,
			y: baseY + uy,
			points: `${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`
		};
	}

	/** One connection, rim to rim, with a head on each end it points at. */
	function connection(from: Point, to: Point, mutual: boolean) {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const length = Math.hypot(dx, dy) || 1;
		const ux = dx / length;
		const uy = dy / length;

		const forward = head(to, ux, uy);
		// A reciprocal citation gets a head at both ends. A bare line would read
		// as "no direction" when what it means is "both".
		const back = mutual ? head(from, -ux, -uy) : null;

		return {
			x1: back ? back.x : from.x + ux * (from.r + 2),
			y1: back ? back.y : from.y + uy * (from.r + 2),
			x2: forward.x,
			y2: forward.y,
			heads: back ? [forward.points, back.points] : [forward.points]
		};
	}

	/** Everything one cluster needs to draw itself, computed once. */
	function drawing(cluster: Cluster) {
		const { points, width, height } = layout(cluster.nodes.length);
		const index = new Map(cluster.nodes.map((node, i) => [node.task.id, i]));
		const lines = cluster.edges.map((edge) =>
			connection(points[index.get(edge.from)!], points[index.get(edge.to)!], edge.mutual)
		);
		return { points, lines, width, height };
	}

	/** What a node says when pointed at: its title, and how it is connected. */
	function describe(node: Cluster['nodes'][number]) {
		const parts = [node.task.title];
		if (node.out.length > 0) parts.push(`cites ${node.out.length}`);
		if (node.in.length > 0) parts.push(`cited by ${node.in.length}`);
		return parts.join(' — ');
	}

	const taskHref = (id: string) =>
		resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
	const inline = (title: string, taskId: string) =>
		renderInline(title, { ref, branch: repo.branch, taskId });

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<svelte:head>
	<title>{repo.name} — references</title>
</svelte:head>

<main>
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		<section class="masthead panel">
			<h1>
				{#if graph.clusters.length === 0}
					<span class="highlight">No task cites another</span>
				{:else}
					<span class="highlight">{plural(graph.linkCount, 'citation', 'citations')}</span>
					<span class="detail">
						across {plural(graph.clusters.length, 'group', 'groups')} of tasks.
					</span>
				{/if}
			</h1>
			{#if graph.isolated.length > 0}
				<p class="aside">
					{plural(graph.isolated.length, 'task cites', 'tasks cite')} nobody and
					{graph.isolated.length === 1 ? 'is' : 'are'} cited by nobody.
				</p>
			{/if}
		</section>

		{#if graph.clusters.length > 0}
			<div class="clusters">
				{#each graph.clusters as cluster (cluster.nodes[0].task.id)}
					{@const draw = drawing(cluster)}
					<article class="cluster panel" class:wide={cluster.nodes.length >= 5}>
						<svg viewBox="0 0 {draw.width} {draw.height}" style:max-width="{draw.width * SCALE}px">
							{#each draw.lines as line, i (i)}
								<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
								{#each line.heads as head (head)}
									<polygon points={head} />
								{/each}
							{/each}
							<!-- The node is the link, so the drawing is navigable on its own
							     and not just a picture of the legend below it. -->
							{#each cluster.nodes as node, i (node.task.id)}
								<a href={taskHref(node.task.id)} data-key-row>
									<title>{describe(node)}</title>
									<circle
										cx={draw.points[i].x}
										cy={draw.points[i].y}
										r={draw.points[i].r}
										class:closed={node.task.closed}
									/>
									<text
										x={draw.points[i].x}
										y={draw.points[i].y + 3.5}
										class:closed={node.task.closed}>{i + 1}</text
									>
								</a>
							{/each}
						</svg>

						<!-- The numbers carry the drawing and the titles carry the meaning.
						     Fitting a title inside a node is what stalled the upstream
						     attempt at this graph; a legend sidesteps it entirely, and works
						     without a pointer. -->
						<ol>
							{#each cluster.nodes as node, i (node.task.id)}
								<li>
									<span class="marker" class:closed={node.task.closed}>{i + 1}</span>
									<a href={taskHref(node.task.id)}>
										{@html inline(node.task.title, node.task.id)}
									</a>
								</li>
							{/each}
						</ol>
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 68rem;
		padding: 1.75rem 1.5rem 4rem;
	}

	.masthead {
		margin-bottom: var(--card-gap);
		padding: 1.75rem 1.9rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.4rem, 3vw, 2rem);
		font-weight: 800;
		line-height: 1.3;
	}

	.detail {
		color: var(--fg);
	}

	.aside {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
		color: var(--muted);
	}

	.clusters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
		gap: var(--card-gap);
	}

	/* A star is both taller and busier than a pair, so it takes two columns
	   where there are two to take. */
	.cluster.wide {
		grid-column: span 2;
	}

	@media (max-width: 44rem) {
		.cluster.wide {
			grid-column: auto;
		}
	}

	.cluster {
		padding: 1rem 1.25rem 1.25rem;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 auto;
	}

	line {
		stroke: var(--baseline);
		stroke-width: 1.5;
	}

	svg a {
		cursor: pointer;
	}

	circle {
		fill: var(--series-open);
		/* A ring in the surface colour keeps two nodes readable where the ring
		   packs them close, and marks the one under the pointer. */
		stroke: var(--surface);
		stroke-width: 2;
	}

	circle.closed {
		fill: var(--series-closed);
	}

	svg a:hover circle,
	svg a:focus-visible circle {
		stroke: var(--accent-text);
	}

	svg a:focus {
		outline: none;
	}

	text {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
		text-anchor: middle;
		fill: var(--on-accent);
	}

	text.closed {
		fill: var(--on-closed);
	}

	polygon {
		fill: var(--baseline);
	}

	ol {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.35rem;
	}

	li {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.marker {
		flex-shrink: 0;
		width: 1.35rem;
		height: 1.35rem;
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--on-accent);
		background: var(--series-open);
		border-radius: var(--radius-full);
	}

	.marker.closed {
		color: var(--on-closed);
		background: var(--series-closed);
	}

	li a {
		color: var(--fg);
	}

	li a:hover {
		color: var(--accent-text);
	}
</style>
