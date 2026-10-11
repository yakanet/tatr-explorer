<script lang="ts">
	// The "+N" pill: how many links a task holds on a card of its own. In a card
	// it leads to that card; in the key above the cards it only shows the look.
	interface Props {
		count: number;
		/** The card it leads to, absent in the key. */
		href?: string;
		title?: string;
	}

	let { count, href, title }: Props = $props();
</script>

{#if href}<a class="jump" {href} {title}>+{count}</a>{:else}<span class="jump">+{count}</span>{/if}

<style>
	.jump {
		margin-left: 0.4rem;
		padding: 0 0.4rem;
		font-size: 0.75rem;
		color: var(--accent-text);
		background: var(--tint-lilac);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	a.jump:hover {
		color: var(--on-accent);
		background: var(--accent);
	}
</style>
