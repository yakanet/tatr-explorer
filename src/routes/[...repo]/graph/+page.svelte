<script lang="ts">
	import { getContext } from 'svelte';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import GraphSummary from './GraphSummary.svelte';
	import StarCard from './StarCard.svelte';
	import { buildGraph, linkCount, starCards } from '#lib/tatr/graph.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	// The graph includes closed tasks, because a closed task that answered an open
	// one is what the reader is looking for.
	const graph = $derived(buildGraph(repo.tasks));
	const cards = $derived(starCards(graph));
	const held = $derived(new Map(cards.map((card) => [card.pivot.id, linkCount(card)])));
</script>

<svelte:head>
	<title>{repo.name} · references</title>
</svelte:head>

<main>
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		<GraphSummary {graph} {cards} />

		<!-- Each card draws one pivot and only its own links, as a star, so no line
		     crosses another however dense the repository. A link between two of
		     its neighbours is drawn in one of their cards. -->
		<div class="cards">
			{#each cards as card (card.pivot.id)}
				<StarCard {card} {held} {ref} assetUrl={repo.assetUrl} />
			{/each}
		</div>
	{/if}
</main>

<style>
	main {
		--column: 68rem;
		padding-bottom: 4rem;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 30rem), 1fr));
		gap: var(--card-gap);
		align-items: start;
	}
</style>
