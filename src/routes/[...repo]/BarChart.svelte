<script lang="ts" generics="Bucket extends { count: number }">
	// Draws buckets as bars, each a button that calls `onpick` with its term. The
	// caller draws what each label holds through `label`, because a priority and
	// a tag read differently.
	import type { Snippet } from 'svelte';

	interface Props {
		buckets: Bucket[];
		/** What the chart says when there is no bucket. */
		empty: string;
		/** The query a bar opens the list on, which also tells the bars apart. */
		termOf: (bucket: Bucket) => string;
		/** The bar's tooltip, where the chart has one. */
		titleOf?: (bucket: Bucket) => string;
		/** Sets the labels in the monospace face, as for a priority. */
		mono?: boolean;
		/** Widens the label column for a label that is a word rather than a number. */
		wide?: boolean;
		label: Snippet<[Bucket]>;
		/** Called with a bar's term, which the page opens the list on. */
		onpick: (term: string) => void;
	}

	let {
		buckets,
		empty,
		termOf,
		titleOf,
		mono = false,
		wide = false,
		label,
		onpick
	}: Props = $props();

	const max = $derived(Math.max(1, ...buckets.map((bucket) => bucket.count)));
</script>

{#if buckets.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<ul class="bars">
		{#each buckets as bucket (termOf(bucket))}
			{@const term = termOf(bucket)}
			<li>
				<button class="row" data-key-row onclick={() => onpick(term)} title={titleOf?.(bucket)}>
					<span class={['label', { mono, wide }]}>{@render label(bucket)}</span>
					<span class="track">
						<span class="fill" style:width="{(bucket.count / max) * 100}%"></span>
					</span>
					<span class="value mono">{bucket.count}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.bars {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: 2rem;
		padding: 0 0.35rem;
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
	}

	.row:hover {
		background: var(--tint);
	}

	.label {
		width: 3ch;
		text-align: right;
		color: var(--ink-2);
		flex-shrink: 0;
	}

	.label.wide {
		width: 9ch;
	}

	/* The track draws the empty part of the bar, so a short bar still reads as
	   a share of a whole. */
	.track {
		flex-grow: 1;
		display: block;
		height: 12px;
		border-radius: var(--radius-full);
		background: var(--track);
	}

	.fill {
		display: block;
		height: 100%;
		min-width: 12px;
		background: var(--series-open);
		border-radius: var(--radius-full);
	}

	.value {
		width: 3ch;
		font-weight: 700;
	}
</style>
