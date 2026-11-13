<script lang="ts" module>
	function removeLabel(locked: boolean): string {
		if (locked) return 'Remove, and forget its token';
		return 'Remove';
	}
</script>

<script lang="ts">
	// Shows one repository of a RepositoryList as a card that opens it, the whole
	// card being the link: its label, then a line about it, and a way to remove it
	// where it can be.
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import lock from 'virtual:icons/lucide:lock.svg';
	import x from 'virtual:icons/lucide:x.svg';

	interface Props {
		/** The path in the site's URLs that the card opens. */
		path: string;
		/** What the card shows for the repository, its path unless said otherwise. */
		label?: string;
		/** Whether it is a private repository, read with a token kept here. */
		locked?: boolean;
		/** Removes the card, or is undefined where there is nothing to remove. */
		onremove?: () => void;
		children: Snippet;
	}

	let { path, label = path, locked = false, onremove, children }: Props = $props();
</script>

<li class:removable={onremove}>
	<a href={resolve('/[...repo]', { repo: path })} data-key-row>
		<span class="path mono">
			{#if locked}
				<svg class="lock" viewBox={lock.viewBox} width="1em" height="1em" aria-hidden="true"
					>{@html lock.body}</svg
				>
				<span class="sr">Private:</span>
			{/if}
			{label}
		</span>
		<span class="about">{@render children()}</span>
	</a>
	{#if onremove}
		<!-- Outside the link, which a button cannot sit in. Removing a private
		     repository also forgets its token, so the label says so. -->
		<button
			class="remove"
			title={removeLabel(locked)}
			aria-label="{removeLabel(locked)}: {label}"
			onclick={onremove}
		>
			<svg viewBox={x.viewBox} width="1em" height="1em" aria-hidden="true">{@html x.body}</svg>
		</button>
	{/if}
</li>

<style>
	/* The remove button sits over the card's right end, as a button cannot sit
	   in the link. */
	li {
		display: grid;
	}

	li > * {
		grid-area: 1 / 1;
	}

	.removable a {
		padding-right: 3.5rem;
	}

	.remove {
		justify-self: end;
		align-self: center;
		display: grid;
		place-items: center;
		width: var(--target);
		height: var(--target);
		margin-right: 0.6rem;
		color: var(--muted);
		background: none;
		border: none;
		border-radius: var(--radius-full);
		cursor: pointer;
	}

	.remove:hover {
		color: var(--fg);
		background: var(--tint);
	}

	.lock {
		vertical-align: -0.125em;
		color: var(--muted);
	}

	li a {
		display: grid;
		gap: 0.2rem;
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
		font-size: 0.8125rem;
		color: var(--ink-2);
	}
</style>
