<script lang="ts">
	// Frames a chart in a panel, under a header that holds its title and a hint.
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** A few words after the title on how to read the chart. */
		hint: string;
		/** A key to the chart's colours, at the end of the header. */
		legend?: Snippet;
		children: Snippet;
	}

	let { title, hint, legend, children }: Props = $props();
</script>

<section class="panel">
	<header>
		<h2>{title}</h2>
		<span class="hint">· {hint}</span>
		{@render legend?.()}
	</header>
	{@render children()}
</section>

<style>
	.panel {
		padding: 1.5rem 1.625rem;
	}

	.panel header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.6rem;
		margin-bottom: 1rem;
	}

	h2 {
		margin: 0;
		font-size: 0.875rem;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--muted);
	}
</style>
