<script lang="ts">
	// Offers the repositories already read, from the cache, or this viewer's own
	// repository while nothing is cached.
	import RepositoryCard from './RepositoryCard.svelte';
	import RepositoryList from './RepositoryList.svelte';
	import { counted } from '#lib/plural.ts';
	import { toSuggestions, type CachedShape, type Suggestion } from '#lib/repo/recent.ts';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { openStore } from '#lib/sources/store.ts';
	import { describeAge } from '#lib/state/repository.svelte.ts';

	let suggestions = $state<Suggestion[]>([]);

	/**
	 * Reads the suggestions from the cache in the browser only, so the
	 * prerendered HTML leaves the slot empty rather than shipping a guess that
	 * would flash and be replaced.
	 */
	$effect(() => {
		let alive = true;
		openStore()
			.list<CachedShape>()
			.then((rows) => {
				if (alive) suggestions = toSuggestions(rows, formatRepoPath);
			})
			.catch(() => {
				// Storage can be unavailable, and the fallback is still worth showing.
				if (alive) suggestions = toSuggestions([], formatRepoPath);
			});
		return () => {
			alive = false;
		};
	});

	/**
	 * The list's heading. The first suggestion tells which list it is, since the
	 * fallback is only ever offered alone.
	 */
	function headingOf(first: Suggestion) {
		if (first.storedAt === null) return 'Try it on';
		return 'Already read';
	}

	/** Describes a suggestion, such as "64 tasks, 23 still open", or why the fallback is offered. */
	function describe(one: Suggestion): string {
		if (one.storedAt === null) return "This viewer's own backlog";
		const tasks = counted(one.total, 'task', 'tasks');
		if (one.open === 0) return `${tasks}, all closed`;
		return `${tasks}, ${one.open} still open`;
	}
</script>

{#if suggestions.length > 0}
	<RepositoryList heading={headingOf(suggestions[0])}>
		{#each suggestions as one (one.path)}
			<RepositoryCard path={one.path}>
				{describe(one)}
				{#if one.storedAt !== null}
					<span class="age">· read {describeAge(one.storedAt)}</span>
				{/if}
			</RepositoryCard>
		{/each}
	</RepositoryList>
{/if}

<style>
	.age {
		color: var(--muted);
	}
</style>
