<script lang="ts">
	// Shows how many open tasks carry each priority, highest first.
	import BarChart from './BarChart.svelte';
	import ChartPanel from './ChartPanel.svelte';
	import { byPriority } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	interface Props {
		/** The open tasks, the only ones the chart counts. */
		open: Task[];
		/** Called with a bar's term, which the page opens the list on. */
		onpick: (term: string) => void;
	}

	let { open, onpick }: Props = $props();
</script>

<ChartPanel title="open by priority" hint="higher is more urgent">
	<BarChart
		buckets={byPriority(open)}
		empty="Nothing open."
		termOf={(bucket) => `priority eq ${bucket.priority}`}
		mono
		{onpick}
	>
		{#snippet label(bucket)}{bucket.priority}{/snippet}
	</BarChart>
</ChartPanel>
