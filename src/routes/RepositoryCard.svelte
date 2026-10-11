<script lang="ts">
	// Shows one repository of a RepositoryList as a card that opens it: its label,
	// then a line about it.
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';

	interface Props {
		/** The path in the site's URLs that the card opens. */
		path: string;
		/** What the card shows for the repository, its path unless said otherwise. */
		label?: string;
		children: Snippet;
	}

	let { path, label = path, children }: Props = $props();
</script>

<li>
	<a href={resolve('/[...repo]', { repo: path })} data-key-row>
		<span class="path mono">{label}</span>
		<span class="about">{@render children()}</span>
		<span class="arrow" aria-hidden="true">→</span>
	</a>
</li>

<style>
	li a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.2rem 1rem;
		padding: 0.85rem 1.1rem;
		color: var(--fg);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}

	li a:hover {
		border-color: var(--accent-line);
	}

	.path {
		font-weight: 700;
		color: var(--accent-text);
		overflow-wrap: anywhere;
	}

	.about {
		grid-column: 1;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.arrow {
		grid-row: 1 / span 2;
		grid-column: 2;
		color: var(--muted);
	}
</style>
