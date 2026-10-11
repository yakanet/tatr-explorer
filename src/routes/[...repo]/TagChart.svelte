<script lang="ts">
	// Shows how many open tasks carry each tag, most used first.
	import BarChart from './BarChart.svelte';
	import ChartPanel from './ChartPanel.svelte';
	import { tagHue } from '#lib/render/tag-hue.ts';
	import { byTag } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	interface Props {
		/** The open tasks, the only ones the chart counts. */
		open: Task[];
		/** Each tag's description from `tasks/tags`, shown as its bar's tooltip. */
		descriptions: Map<string, string>;
		/** Called with a bar's term, which the page opens the list on. */
		onpick: (term: string) => void;
	}

	let { open, descriptions, onpick }: Props = $props();
</script>

<ChartPanel title="open by tag" hint="click to see them">
	<BarChart
		buckets={byTag(open)}
		empty="No open task carries a tag."
		termOf={(bucket) => `:${bucket.tag}`}
		titleOf={(bucket) => descriptions.get(bucket.tag) ?? ''}
		wide
		{onpick}
	>
		{#snippet label(bucket)}
			<span class="tag" data-hue={tagHue(bucket.tag)}>{bucket.tag}</span>
		{/snippet}
	</BarChart>
</ChartPanel>
