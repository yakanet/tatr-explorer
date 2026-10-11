<script lang="ts">
	// Shows a heading over a list of repositories to open, each a RepositoryCard.
	import type { Snippet } from 'svelte';

	interface Props {
		heading: string;
		children: Snippet;
	}

	let { heading, children }: Props = $props();
</script>

<section class="recent">
	<h2>{heading}</h2>
	<ul>
		{@render children()}
	</ul>
</section>

<style>
	.recent {
		margin-top: 2.5rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
	}
</style>
