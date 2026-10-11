<script lang="ts">
	import { resolve } from '$app/paths';
	import { reopenerOf } from '#lib/components/reopeners.ts';
	import { onBranch } from '#lib/repo/branch.ts';
	import type { RepoRef } from '#lib/repo/ref.ts';
	import { FAILURE_HEADINGS, type RepositoryState } from '#lib/state/repository.svelte.ts';

	let { repo, ref }: { repo: RepositoryState; ref: RepoRef } = $props();

	const percent = $derived.by(() => {
		if (repo.total === 0) return 0;
		return Math.round((repo.done / repo.total) * 100);
	});
	/** What a reading costs, in the source's words: a request, or nothing. */
	const cost = $derived(repo.source?.cost);
	/** The gesture that opens the source again, where trying again cannot. */
	const reopener = $derived(reopenerOf(ref));
</script>

{#if repo.phase === 'listing' || repo.phase === 'reading'}
	<section class="panel">
		<p class="step">
			<span class="tick" class:done={repo.phase === 'reading'}></span>
			Listing the repository
			{#if cost}<span class="hint">{cost.listing}</span>{/if}
		</p>
		<p class="step">
			<span class="tick" class:active={repo.phase === 'reading'}></span>
			Reading task files
			{#if repo.total > 0}<span class="hint">{repo.done} / {repo.total}</span>{/if}
		</p>
		{#if repo.total > 0}
			<div class="bar"><div class="fill" style:width="{percent}%"></div></div>
		{/if}
		{#if cost}<p class="note">{cost.files}</p>{/if}
	</section>
{:else if repo.phase === 'failed' && repo.failure}
	<!-- The heading names the failure kind; the message is the source's, which
	     alone knows its rate limit, its fallbacks or a folder it lost. -->
	<section class="panel" class:warn={repo.failure.kind === 'rate-limited'}>
		<h2>{FAILURE_HEADINGS[repo.failure.kind]}</h2>
		<p>{repo.failure.message}</p>
		{#if repo.failure.kind === 'no-tasks-folder'}
			<p class="note">
				This viewer expects the tatr layout: one folder per task, each holding a
				<code>TASK.md</code>.
			</p>
		{/if}
		<div class="actions">
			{#if reopener}
				<reopener.control label={reopener.label} />
			{:else}
				<button class="action" onclick={() => repo.refresh()}>Try again</button>
				{#if ref.branch}
					<a href={onBranch(ref, undefined)}>Read HEAD instead</a>
				{/if}
			{/if}
			<a href={resolve('/')}>Another repository</a>
		</div>
	</section>
{/if}

<style>
	.panel {
		padding: 1.25rem 1.5rem;
	}

	.panel.warn {
		border-color: var(--warning);
	}

	h2 {
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}

	/* The headings are lower case because the header reuses them mid-sentence. */
	h2::first-letter {
		text-transform: uppercase;
	}

	p {
		margin: 0 0 0.6rem;
		line-height: 1.6;
	}

	.note {
		color: var(--ink-2);
		font-size: 0.8125rem;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.tick {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid var(--baseline);
	}

	.tick.done {
		background: var(--good);
		border-color: var(--good);
	}

	.tick.active {
		border-color: var(--accent);
	}

	.hint {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--muted);
	}

	/* The same pill and track as the dashboard's bars. */
	.bar {
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--track);
		overflow: hidden;
		margin: 0.6rem 0 0.85rem;
	}

	.fill {
		height: 100%;
		background: var(--accent);
		border-radius: var(--radius-full);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.75rem;
	}
</style>
