<script lang="ts">
	// Shows one pivot and the tasks it links with: a drawing with the pivot in the
	// middle of a ring of numbered nodes, and the list of their titles beside it.
	import { taskHref } from '#lib/repo/hrefs.ts';
	import type { RepoRef } from '#lib/repo/ref.ts';
	import { renderTitle, type RenderOptions } from '#lib/render/markdown.ts';
	import { counted } from '#lib/plural.ts';
	import { linkCount, type StarCard } from '#lib/tatr/graph.ts';
	import type { Task } from '#lib/tatr/task.ts';
	import Jump from './Jump.svelte';
	import { drawing, GLYPH, SIZE, type Point } from './star.ts';

	interface Props {
		card: StarCard;
		/** The link count of each pivot's card, shown on a neighbour that leads to it. */
		held: ReadonlyMap<string, number>;
		ref: RepoRef;
		assetUrl: RenderOptions['assetUrl'];
	}

	let { card, held, ref, assetUrl }: Props = $props();

	const draw = $derived(drawing(card));

	const SAY = { in: 'cites it', out: 'cited by it', both: 'both ways' } as const;

	const anchor = (id: string) => `pivot-${id}`;

	/**
	 * The task under the pointer or the keyboard focus, lit in the drawing and
	 * the list together so a number is a glance from its title. Each card keeps
	 * its own, because a task can appear in several.
	 */
	let lit = $state<string | null>(null);
	const light = (task: Task) => () => (lit = task.id);
	const unlight = () => (lit = null);
</script>

<article
	class="card panel"
	class:focusing={lit !== null && lit !== card.pivot.id}
	id={anchor(card.pivot.id)}
>
	<!-- The drawing is hidden from assistive technology and the tab order,
	     because the list beside it carries the same links with titles. -->
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		{#each draw.nodes as node (node.task.id)}
			<g class={node.kind} class:hot={lit === node.task.id}>
				<line x1={node.line.x1} y1={node.line.y1} x2={node.line.x2} y2={node.line.y2} />
				{#each node.line.heads as points (points)}
					<polygon {points} />
				{/each}
			</g>
		{/each}
		{@render dot(card.pivot, draw.pivot, null)}
		{#each draw.nodes as node, i (node.task.id)}
			{@render dot(node.task, node.at, i + 1)}
		{/each}
	</svg>

	<div class="text">
		<h2 class:hot={lit === card.pivot.id}>
			<a
				href={taskHref(ref, card.pivot.id)}
				data-key-row
				onmouseenter={light(card.pivot)}
				onmouseleave={unlight}
				onfocus={light(card.pivot)}
				onblur={unlight}>{@html renderTitle(card.pivot, assetUrl)}</a
			>
		</h2>
		<p class="meta">
			<code class="id">{card.pivot.id}</code> · {counted(linkCount(card), 'link', 'links')} here
		</p>
		<ol>
			{#each draw.nodes as node, i (node.task.id)}
				<li
					class:hot={lit === node.task.id}
					onmouseenter={light(node.task)}
					onmouseleave={unlight}
					onfocusin={light(node.task)}
					onfocusout={unlight}
				>
					<span class="number" aria-hidden="true">{i + 1}</span>
					<span class="glyph {node.kind}" title={SAY[node.kind]}
						>{GLYPH[node.kind]}<span class="sr">{SAY[node.kind]}:</span></span
					>
					<span>
						<a href={taskHref(ref, node.task.id)} data-key-row
							>{@html renderTitle(node.task, assetUrl)}</a
						>
						<!-- A neighbour with a card of its own links to it, so the
						     reader can walk the graph one card at a time. -->
						{#if held.has(node.task.id)}
							<Jump
								count={held.get(node.task.id)!}
								href="#{anchor(node.task.id)}"
								title="Its own card, with {counted(held.get(node.task.id)!, 'link', 'links')}"
							/>
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
					<span class="glyph self" aria-hidden="true">{GLYPH.self}</span>
					<span class="itself">Cites itself</span>
				</li>
			{/if}
		</ol>
	</div>
</article>

<!-- One node of the drawing: the pivot when `number` is null, a neighbour
     otherwise. -->
{#snippet dot(task: Task, at: Point, number: number | null)}
	<a
		href={taskHref(ref, task.id)}
		tabindex="-1"
		class:hot={lit === task.id}
		onmouseenter={light(task)}
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
</style>
