<script lang="ts">
	// Frames one panel of a task's sidebar: a heading, the content, then a note
	// about where the content comes from.
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children: Snippet;
		note: Snippet;
	}

	let { title, children, note }: Props = $props();
</script>

<section class="panel">
	<h2>{title}</h2>
	{@render children()}
	<p class="note">{@render note()}</p>
</section>

<style>
	.panel {
		padding: 1.125rem 1.25rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
	}

	.note {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
		line-height: 1.5;
	}

	/* A file name or a command stays on one line, as it is typed. */
	.note :global(code) {
		white-space: nowrap;
	}
</style>
