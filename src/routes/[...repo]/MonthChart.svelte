<script lang="ts">
	// Shows how many tasks were created each month, split by whether they are
	// still open or since closed.
	import ChartPanel from './ChartPanel.svelte';
	import type { MonthBucket } from '#lib/tatr/stats.ts';

	interface Props {
		months: MonthBucket[];
	}

	let { months }: Props = $props();

	const max = $derived(Math.max(1, ...months.map((bucket) => bucket.open + bucket.closed)));

	// In English, as is all of the site's copy, whatever the reader's language.
	const TICK = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });

	/** The tick under a month written `2026-03`: `mar`. */
	function tickOf(month: string): string {
		return TICK.format(new Date(`${month}-01T00:00:00Z`)).toLowerCase();
	}
</script>

<ChartPanel title="created per month" hint="every task ever">
	{#snippet legend()}
		<span class="legend">
			<span class="chip"><span class="key open"></span>still open</span>
			<span class="chip"><span class="key closed"></span>since closed</span>
		</span>
	{/snippet}
	{#if months.length === 0}
		<p class="empty">No tasks yet.</p>
	{:else}
		<div class="months">
			{#each months as bucket (bucket.month)}
				{@const total = bucket.open + bucket.closed}
				<div class="month" title="{bucket.month}: {bucket.open} open, {bucket.closed} closed">
					<div class="stack">
						<!-- The column is anchored at the bottom, so the first segment sits on
						     top and carries the rounded end. A month with no tasks keeps a
						     short pill, so it reads as empty rather than missing. -->
						{#if bucket.closed > 0}
							<div class="seg closed" style:height="{(bucket.closed / max) * 100}%"></div>
						{/if}
						{#if bucket.open > 0}
							<div class="seg open" style:height="{(bucket.open / max) * 100}%"></div>
						{/if}
						{#if total === 0}
							<div class="seg none"></div>
						{/if}
					</div>
					<span class="tick mono">{tickOf(bucket.month)}</span>
					<span class="n mono" class:zero={total === 0}>{total || ''}</span>
				</div>
			{/each}
		</div>
		<p class="source">dates come from the folder names</p>
	{/if}
</ChartPanel>

<style>
	/* The footnote has the look of the panel's hint. */
	.source {
		margin: 0.75rem 0 0;
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-left: auto;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.1rem 0.65rem 0.1rem 0.4rem;
		border-radius: var(--radius-full);
		background: var(--tint);
	}

	.key {
		width: 10px;
		height: 10px;
		border-radius: var(--radius-full);
		display: inline-block;
	}

	.key.open,
	.seg.open {
		background: var(--series-open);
	}

	.key.closed,
	.seg.closed {
		background: var(--series-closed);
	}

	.months {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		height: 132px;
	}

	.month {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		height: 100%;
	}

	.stack {
		flex-grow: 1;
		width: 100%;
		max-width: 22px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		/* The gap keeps the two series from touching. */
		gap: 3px;
		margin: 0 auto;
	}

	/* A column is rounded at its top and its foot, and square where two
	   segments meet. */
	.seg {
		min-height: 3px;
	}

	.seg:first-child {
		border-top-left-radius: 11px;
		border-top-right-radius: 11px;
	}

	.seg:last-child {
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
	}

	.seg.none {
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--track);
	}

	.tick {
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.n {
		font-size: 0.8125rem;
		color: var(--muted);
		min-height: 1.2rem;
	}

	.n.zero {
		color: transparent;
	}
</style>
