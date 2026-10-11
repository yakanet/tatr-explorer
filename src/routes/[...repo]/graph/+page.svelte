<script lang="ts">
	import { getContext } from 'svelte';
	import { resolve } from '$app/paths';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { renderInline } from '#lib/render/markdown.ts';
	import { buildGraph, starCards, type StarCard } from '#lib/tatr/graph.ts';
	import type { Task } from '#lib/tatr/task.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	// The graph includes closed tasks, because a closed task that answered an open
	// one is what the reader is looking for.
	const graph = $derived(buildGraph(repo.tasks));
	const cards = $derived(starCards(graph));

	/** The number of links a card holds, counting the pivot citing itself. */
	const linksOf = (card: StarCard) => card.links.length + (card.self ? 1 : 0);
	/** The link count of each pivot's card, shown on a neighbour that leads to it. */
	const held = $derived(new Map(cards.map((card) => [card.pivot.id, linksOf(card)])));

	const SIZE = 200;
	const PIVOT_R = 18;
	const NODE_R = 13;
	const RING = 74;
	const HEAD_LENGTH = 10;
	const HEAD_WIDTH = 8;

	interface Point {
		x: number;
		y: number;
		r: number;
	}

	/**
	 * Returns an arrowhead pointing at `at` along the unit vector (ux, uy), and
	 * the point where its line should stop.
	 *
	 * The head is a polygon rather than an SVG `marker`, because a marker is
	 * placed by `refX` in its own scaled viewBox and sized in stroke widths, so
	 * its tip cannot be set exactly on the circle.
	 */
	function head(at: Point, ux: number, uy: number) {
		const tipX = at.x - ux * (at.r + 1);
		const tipY = at.y - uy * (at.r + 1);
		const baseX = tipX - ux * HEAD_LENGTH;
		const baseY = tipY - uy * HEAD_LENGTH;
		const px = -uy * (HEAD_WIDTH / 2);
		const py = ux * (HEAD_WIDTH / 2);
		return {
			// The line stops just inside the base, because a line running under
			// the head would show through its edges.
			x: baseX + ux,
			y: baseY + uy,
			points: `${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`
		};
	}

	/** Draws one spoke from rim to rim, with a head on each end it points at. */
	function spoke(from: Point, to: Point, both: boolean) {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const length = Math.hypot(dx, dy) || 1;
		const ux = dx / length;
		const uy = dy / length;
		const forward = head(to, ux, uy);
		const back = both ? head(from, -ux, -uy) : null;
		return {
			x1: back ? back.x : from.x + ux * (from.r + 2),
			y1: back ? back.y : from.y + uy * (from.r + 2),
			x2: forward.x,
			y2: forward.y,
			heads: back ? [forward.points, back.points] : [forward.points]
		};
	}

	/**
	 * Lays out a card's drawing, with the pivot in the middle and its neighbours
	 * on a ring around it.
	 *
	 * Going round from the left in list order, the tasks citing the pivot come
	 * first, the mutual ones over the top and the ones it cites on the right, so
	 * every card reads the same way. The node numbers match the list beside it.
	 */
	function drawing(card: StarCard) {
		const pivot: Point = { x: SIZE / 2, y: SIZE / 2, r: PIVOT_R };
		const count = card.links.length;
		const nodes = card.links.map(({ task, kind }, i) => {
			// A lone neighbour sits on the right, where a reader looks next.
			const angle = count === 1 ? 0 : Math.PI + (i * 2 * Math.PI) / count;
			const at: Point = {
				x: pivot.x + RING * Math.cos(angle),
				y: pivot.y + RING * Math.sin(angle),
				r: NODE_R
			};
			const line = kind === 'in' ? spoke(at, pivot, false) : spoke(pivot, at, kind === 'both');
			return { task, kind, at, line };
		});
		return { pivot, nodes };
	}

	const GLYPH = { in: '←', out: '→', both: '⇄' } as const;
	const SAY = { in: 'cites it', out: 'cited by it', both: 'both ways' } as const;

	const taskHref = (id: string) =>
		resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
	const inline = (title: string, taskId: string) =>
		renderInline(title, { assetUrl: repo.assetUrl, taskId });
	const anchor = (id: string) => `pivot-${id}`;

	/**
	 * The task under the pointer or the keyboard focus, lit in the drawing and
	 * the list together so a number is a glance from its title. It keeps its card
	 * because a task can appear in several.
	 */
	let lit = $state<{ card: string; task: string } | null>(null);
	const light = (card: StarCard, task: Task) => () =>
		(lit = { card: card.pivot.id, task: task.id });
	const unlight = () => (lit = null);
	/** The lit task in this card, or null. */
	const litIn = (card: StarCard) => (lit?.card === card.pivot.id ? lit.task : null);

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<svelte:head>
	<title>{repo.name} · references</title>
</svelte:head>

<main>
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		<section class="masthead panel">
			<h1>
				{#if cards.length === 0}
					<span class="highlight">No task cites another</span>
				{:else}
					<span class="highlight">{plural(graph.linkCount, 'citation', 'citations')}</span>
					around {plural(cards.length, 'task', 'tasks')}.
				{/if}
			</h1>
			<!-- Each card shows only one task's links, so the masthead states how
			     the tasks group together. -->
			{#if repo.tasks.length > 0}
				<p class="aside">
					{#if graph.clusters.length > 0}
						The linked tasks form {plural(graph.clusters.length, 'group', 'groups')}, the largest of
						{graph.clusters[0].nodes.length}.
					{/if}
					{#if graph.isolated.length > 0}
						{plural(graph.isolated.length, 'task cites', 'tasks cite')} nobody and
						{graph.isolated.length === 1 ? 'is' : 'are'} cited by nobody.
					{/if}
				</p>
			{/if}
			{#if cards.length > 0}
				<p class="key">
					<span><b class="in">←</b>cites the task in the middle</span>
					<span><b class="out">→</b>is cited by it</span>
					<span><b class="both">⇄</b>both ways</span>
					{#if cards.some((card) => card.self)}
						<span><b class="self">↺</b>cites itself</span>
					{/if}
					<span><span class="jump">+3</span>has a card of its own</span>
				</p>
			{/if}
		</section>

		<!-- Each card draws one pivot and only its own links, as a star, so no line
		     crosses another however dense the repository. A link between two of
		     its neighbours is drawn in one of their cards. -->
		<div class="cards">
			{#each cards as card (card.pivot.id)}
				{@const draw = drawing(card)}
				{@const here = litIn(card)}
				<article
					class="card panel"
					class:focusing={here !== null && here !== card.pivot.id}
					id={anchor(card.pivot.id)}
				>
					<!-- The drawing is hidden from assistive technology and the tab order,
					     because the list beside it carries the same links with titles. -->
					<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
						{#each draw.nodes as node (node.task.id)}
							<g class={node.kind} class:hot={here === node.task.id}>
								<line x1={node.line.x1} y1={node.line.y1} x2={node.line.x2} y2={node.line.y2} />
								{#each node.line.heads as points (points)}
									<polygon {points} />
								{/each}
							</g>
						{/each}
						{@render dot(card, card.pivot, draw.pivot, null)}
						{#each draw.nodes as node, i (node.task.id)}
							{@render dot(card, node.task, node.at, i + 1)}
						{/each}
					</svg>

					<div class="text">
						<h2 class:hot={here === card.pivot.id}>
							<a
								href={taskHref(card.pivot.id)}
								data-key-row
								onmouseenter={light(card, card.pivot)}
								onmouseleave={unlight}
								onfocus={light(card, card.pivot)}
								onblur={unlight}>{@html inline(card.pivot.title, card.pivot.id)}</a
							>
						</h2>
						<p class="meta">
							<code class="id">{card.pivot.id}</code> · {plural(linksOf(card), 'link', 'links')} here
						</p>
						<ol>
							{#each draw.nodes as node, i (node.task.id)}
								<li
									class:hot={here === node.task.id}
									onmouseenter={light(card, node.task)}
									onmouseleave={unlight}
									onfocusin={light(card, node.task)}
									onfocusout={unlight}
								>
									<span class="number" aria-hidden="true">{i + 1}</span>
									<span class="glyph {node.kind}" title={SAY[node.kind]}
										>{GLYPH[node.kind]}<span class="sr">{SAY[node.kind]}:</span></span
									>
									<span>
										<a href={taskHref(node.task.id)} data-key-row
											>{@html inline(node.task.title, node.task.id)}</a
										>
										<!-- A neighbour with a card of its own links to it, so the
										     reader can walk the graph one card at a time. -->
										{#if held.has(node.task.id)}
											<a
												class="jump"
												href="#{anchor(node.task.id)}"
												title="Its own card, with {plural(
													held.get(node.task.id)!,
													'link',
													'links'
												)}">+{held.get(node.task.id)}</a
											>
										{/if}
									</span>
								</li>
							{/each}
							<!-- `tatr graph` shows a task citing itself, so the list does too,
							     in an unnumbered row: a spoke has nowhere to go, so the drawing
							     has no node for it. -->
							{#if card.self}
								<li>
									<span class="number" aria-hidden="true"></span>
									<span class="glyph self" aria-hidden="true">↺</span>
									<span class="itself">Cites itself</span>
								</li>
							{/if}
						</ol>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</main>

<!-- One node of a drawing: the pivot when `number` is null, a neighbour
     otherwise. -->
{#snippet dot(card: StarCard, task: Task, at: Point, number: number | null)}
	<a
		href={taskHref(task.id)}
		tabindex="-1"
		class:hot={litIn(card) === task.id}
		onmouseenter={light(card, task)}
		onmouseleave={unlight}
	>
		<title>{task.title}</title>
		<circle class:pivot={number === null} class:closed={task.closed} cx={at.x} cy={at.y} r={at.r} />
		{#if number !== null}
			<text x={at.x} y={at.y + 3.5} class:closed={task.closed}>{number}</text>
		{/if}
	</a>
{/snippet}

<style>
	main {
		max-width: 68rem;
		padding-bottom: 4rem;
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

	.aside {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
		color: var(--muted);
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		margin: 0.85rem 0 0;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.key b {
		margin-right: 0.4rem;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 30rem), 1fr));
		gap: var(--card-gap);
		align-items: start;
	}

	.card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.1rem;
		padding: 1rem 1.25rem 1rem 0.75rem;
		scroll-margin-top: 1rem;
	}

	/* The card a neighbour's "+N" link targets is outlined on arrival. */
	.card:target {
		outline: 2px solid var(--accent-line);
		outline-offset: 2px;
	}

	svg {
		flex: none;
	}

	/* An arrow shows its direction by its head, its side of the drawing and its
	   colour, which matches the glyph in the list. The line and heads take the
	   colour from their group (`.in`, `.out`, `.both` below). */
	line {
		stroke: currentColor;
		stroke-width: 2;
	}

	polygon {
		fill: currentColor;
	}

	/* An incoming arrow uses the mark shade, `--link-in`; the `.in` glyph uses
	   the text shade. */
	g.in {
		color: var(--link-in);
	}

	circle {
		fill: var(--series-open);
		/* The surface-coloured ring separates a node from the line ending at it. */
		stroke: var(--surface);
		stroke-width: 2;
	}

	circle.closed {
		fill: var(--series-closed);
	}

	/* The pivot's ring is in the text colour, so it reads as the card's subject
	   before its title is read. */
	circle.pivot {
		stroke: var(--fg);
	}

	/* The lit task has its node ringed and its arrow thickened, and the card's
	   other arrows fade. */
	svg a.hot circle {
		stroke: var(--accent-text);
		stroke-width: 3;
	}

	g.hot line {
		stroke-width: 3;
	}

	.focusing g:not(.hot) {
		opacity: 0.3;
	}

	h2.hot,
	li.hot {
		background: var(--tint);
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

	.text {
		flex: 1 1 14rem;
		min-width: 0;
		display: grid;
		gap: 0.5rem;
	}

	/* The negative margin offsets the padding, so lighting a row moves nothing. */
	h2,
	li {
		margin: 0 -0.35rem;
		padding: 0.1rem 0.35rem;
		border-radius: var(--radius-sm);
	}

	h2 {
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.meta {
		margin: -0.35rem 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.2rem;
	}

	li {
		display: grid;
		grid-template-columns: 1.4rem 1rem minmax(0, 1fr);
		gap: 0.4rem;
		align-items: baseline;
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.number {
		font-size: 0.6875rem;
		font-weight: 700;
		text-align: right;
		color: var(--muted);
	}

	.glyph {
		font-weight: 700;
	}

	/* The `.in` glyph takes the accent's text shade; the `.out` and `.both`
	   colours are readable as text unchanged. */
	.in {
		color: var(--accent-text);
	}

	.out {
		color: var(--link-out);
	}

	.both,
	.self {
		color: var(--link-both);
	}

	.itself {
		color: var(--muted);
	}

	.text a {
		color: var(--fg);
	}

	.text a:hover {
		color: var(--accent-text);
	}

	.jump,
	.text a.jump {
		margin-left: 0.4rem;
		padding: 0 0.4rem;
		font-size: 0.75rem;
		color: var(--accent-text);
		background: var(--tint-lilac);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	.text a.jump:hover {
		color: var(--on-accent);
		background: var(--accent);
	}
</style>
