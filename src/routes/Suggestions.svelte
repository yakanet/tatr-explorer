<script lang="ts">
	// Offers the repositories already read, from the cache, or this viewer's own
	// repository while nothing is cached.
	import RepositoryCard from './RepositoryCard.svelte';
	import RepositoryList from './RepositoryList.svelte';
	import { counted } from '#lib/plural.ts';
	import { toSuggestions, type CachedShape, type Suggestion } from '#lib/repo/recent.ts';
	import { formatRepoPath, repoKey, repositoryKey } from '#lib/repo/ref.ts';
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
		suggested().then((found) => {
			if (alive) suggestions = found;
		});
		return () => {
			alive = false;
		};
	});

	/** The readings in the cache, each locked when a token is kept for its repository. */
	async function suggested(): Promise<Suggestion[]> {
		const store = openStore();
		try {
			const [rows, tokens] = await Promise.all([store.list<CachedShape>(), store.tokenKeys()]);
			return toSuggestions(rows, formatRepoPath, new Set(tokens));
		} catch {
			// Storage can be unavailable, and the fallback is still worth showing.
			return toSuggestions([], formatRepoPath);
		}
	}

	/**
	 * What removes a card's reading from the cache, with the token of its
	 * repository once no reading of it is left, or nothing for the fallback,
	 * which is not cached.
	 */
	function removerOf(one: Suggestion): (() => Promise<void>) | undefined {
		if (one.storedAt === null) return undefined;
		return async () => {
			await openStore().forget(repoKey(one.ref), repositoryKey(one.ref));
			suggestions = await suggested();
		};
	}

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
			<RepositoryCard path={one.path} locked={one.locked} onremove={removerOf(one)}>
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
