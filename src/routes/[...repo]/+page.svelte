<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import MonthChart from './MonthChart.svelte';
	import PriorityChart from './PriorityChart.svelte';
	import Summary from './Summary.svelte';
	import TagChart from './TagChart.svelte';
	import TopTasks from './TopTasks.svelte';
	import { listHref } from '#lib/repo/hrefs.ts';
	import { searchFor } from '#lib/state/query.svelte.ts';
	import type { Status } from '#lib/tql/command.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { byMonth } from '#lib/tatr/stats.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	// The overview shows the whole repository and ignores the query. A click on a
	// chart opens the filtered list, because a chart that filtered itself would
	// leave the reader with a picture instead of the tasks.
	const all = $derived(repo.tasks);

	// The month chart counts open and closed tasks because it shows history, and
	// its columns do not filter.
	const months = $derived(byMonth(all));

	/** The list URL for a query; the layout reads the query back from it. */
	const listOf = (text: string, status: Status) => listHref(ref) + searchFor(text, status);

	/**
	 * Opens the list filtered on a bar's term and on open tasks, which is what
	 * the bar counted, whatever status the reader chose before.
	 */
	const pick = (term: string) => goto(listOf(term, 'open'));
</script>

<svelte:head>
	<title>{repo.name} · overview</title>
</svelte:head>

<main>
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		<Summary tasks={all} since={months[0]?.month} {listOf} />

		<!-- The priority and tag charts count open tasks only, as `tatr ls` does,
		     because they describe what is left to do. -->
		<div class="charts">
			<PriorityChart open={repo.open} onpick={pick} />
			<TagChart open={repo.open} descriptions={repo.tags.descriptions} onpick={pick} />
		</div>

		<MonthChart {months} />

		<TopTasks open={repo.open} {ref} assetUrl={repo.assetUrl} onpick={pick} />
	{/if}
</main>

<style>
	main {
		max-width: 64rem;
		display: flex;
		flex-direction: column;
		gap: var(--card-gap);
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: var(--card-gap);
	}
</style>
