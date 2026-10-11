<script lang="ts">
	// Says what the last edit came to, in one sentence, with Undo after a write.
	// The layout shows it, so it stays put when the reader switches views.
	import type { RepositoryState } from '#lib/state/repository.svelte.ts';

	interface Props {
		repo: RepositoryState;
	}

	let { repo }: Props = $props();
</script>

<!-- The live region is always there, as a screen reader announces a change to a
     region it already knows, not a region that appears. -->
<div class="region" role="status">
	{#if repo.notice}
		<p class:failed={repo.notice.failed}>
			<span>{repo.notice.text}</span>
			{#if repo.notice.undoable}
				<button class="action" onclick={() => repo.undo()}>Undo</button>
			{/if}
			<button class="dismiss" aria-label="Dismiss" onclick={() => (repo.notice = null)}>×</button>
		</p>
	{/if}
</div>

<style>
	.region {
		position: fixed;
		inset: auto 1rem 1.25rem;
		z-index: 100;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	p {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		padding: 0.375rem 0.5rem 0.375rem 1.25rem;
		font-size: 0.8125rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow-menu);
		pointer-events: auto;
	}

	p.failed {
		border-color: var(--warning);
	}

	.dismiss {
		min-width: var(--target);
		min-height: var(--target);
		font: inherit;
		font-size: 1rem;
		color: var(--muted);
		background: none;
		border: none;
		border-radius: var(--radius-full);
		cursor: pointer;
	}

	.dismiss:hover {
		color: var(--fg);
		background: var(--tint);
	}
</style>
