<script lang="ts">
	// Sums up the reference graph: how many citations there are, how the tasks
	// group together, and the key to the arrows drawn in the cards below.
	import { counted, plural } from '#lib/plural.ts';
	import type { ReferenceGraph, StarCard } from '#lib/tatr/graph.ts';
	import Glyph from './Glyph.svelte';
	import Jump from './Jump.svelte';

	interface Props {
		graph: ReferenceGraph;
		cards: StarCard[];
	}

	let { graph, cards }: Props = $props();

	// Every task is in a cluster or among the isolated ones.
	const hasTasks = $derived(graph.clusters.length > 0 || graph.isolated.length > 0);
</script>

<section class="summary panel">
	<h1>
		{#if cards.length === 0}
			<span class="highlight">No task cites another</span>
		{:else}
			<span class="highlight">{counted(graph.citationCount, 'citation', 'citations')}</span>
			around {counted(cards.length, 'task', 'tasks')}.
		{/if}
	</h1>
	<!-- Each card shows only one task's links, so the summary states how
	     the tasks group together. -->
	{#if hasTasks}
		<p class="aside">
			{#if graph.clusters.length > 0}
				The linked tasks form {counted(graph.clusters.length, 'group', 'groups')}, the largest of
				{graph.clusters[0].nodes.length}.
			{/if}
			{#if graph.isolated.length > 0}
				{counted(graph.isolated.length, 'task cites', 'tasks cite')} nobody and
				{plural(graph.isolated.length, 'is', 'are')} cited by nobody.
			{/if}
		</p>
	{/if}
	{#if cards.length > 0}
		<p class="key">
			<span><Glyph kind="in" />cites the task in the middle</span>
			<span><Glyph kind="out" />is cited by it</span>
			<span><Glyph kind="both" />both ways</span>
			{#if cards.some((card) => card.self)}
				<span><Glyph kind="self" />cites itself</span>
			{/if}
			<span><Jump count={3} />has a card of its own</span>
		</p>
	{/if}
</section>

<style>
	.summary {
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
</style>
