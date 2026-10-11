<script lang="ts">
	import { setContext } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BranchField from '#lib/components/BranchField.svelte';
	import KeyHelp from '#lib/components/KeyHelp.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import Shortcuts from '#lib/components/Shortcuts.svelte';
	import { reopenerOf } from '#lib/components/kinds.ts';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { isBranched, isFollowable, isRereadable } from '#lib/sources/capabilities.ts';
	import {
		FAILURE_HEADINGS,
		RepositoryState,
		describeAge,
		REPOSITORY
	} from '#lib/state/repository.svelte.ts';
	import { QUERY, QueryState } from '#lib/state/query.svelte.ts';

	let { data, children } = $props();
	const ref = $derived(data.ref);

	// One state for every view, so navigating between them costs nothing.
	const repo = new RepositoryState();
	setContext(REPOSITORY, repo);

	// One query too: the charts filter the list and vice versa. A link that
	// carries a query sets it, so the dashboard's counts and bars can be plain
	// links. Typing in the list or the board rewrites the URL through a shallow
	// `goto`, which SvelteKit reports as a navigation like any other; it is
	// skipped here, or the address it just wrote, trimmed, would come back and eat
	// the space under the cursor. Only the `goto`: going back to such an address
	// is reported as shallow too, and that one has to be read.
	const query = new QueryState();
	query.read(page.url.searchParams);
	// Before the new page renders rather than after, so it does not draw once
	// with the old query only to be filtered again.
	onNavigate(({ to, type, shallow }) => {
		if (to && !(type === 'goto' && shallow)) query.read(to.url.searchParams);
	});
	setContext(QUERY, query);

	$effect(() => {
		const current = ref;
		repo.load(current);
		return () => repo.abort();
	});

	const path = $derived(formatRepoPath(ref));
	/** Whether the reading has branches to choose from, which its source says. */
	const branched = $derived(isBranched(repo.source));
	/** What the branch shortcut does: open the menu, where there are branches. */
	const openBranches = $derived.by(() => {
		if (!branched) return undefined;
		return () => (branching = true);
	});
	/** The gesture that opens the source again, where asking it again is not enough. */
	const reopener = $derived(reopenerOf(ref));

	/** Whether Refresh means anything here, which only the source of the reading knows. */
	const rereadable = $derived(isRereadable(repo.source));
	/** Whether the reading keeps itself current, so that its age says nothing. */
	const following = $derived(isFollowable(repo.source));

	// A reading that can follow its source does, for as long as it stands.
	$effect(() => repo.follow());

	let helping = $state(false);

	/**
	 * The query travels with the link, so a filtered view stays shareable, but
	 * each view's address carries only what that view uses (see `searchOf`).
	 * What a view ignores stays in memory rather than in its URL, and comes back
	 * with the next view that uses it.
	 */
	const views = $derived([
		{ name: 'Overview', base: resolve('/[...repo]', { repo: path }), search: '' },
		{
			name: 'List',
			base: resolve('/[...repo]/list', { repo: path }),
			search: query.searchOf('list')
		},
		{
			name: 'Board',
			base: resolve('/[...repo]/board', { repo: path }),
			search: query.searchOf('board')
		},
		{ name: 'References', base: resolve('/[...repo]/graph', { repo: path }), search: '' }
	]);

	let branching = $state(false);

	/** `1`-`9` counts positions in the nav, so an absent view simply does nothing. */
	function switchTo(index: number) {
		const view = views[index];
		if (view) goto(view.base + view.search);
	}

	/** Escape closes what is open, in the order a reader would expect. */
	function dismiss() {
		if (helping) helping = false;
	}

	function folders(count: number): string {
		if (count === 1) return '1 folder';
		return `${count} folders`;
	}
</script>

<!-- A clause of the reading's line, its detail hovered on screen and read out
     after it: too long for a line that should not move for a rare case. -->
{#snippet clause(text: string, detail: string)}
	<span class="stale" title={detail}>
		· {text}
		<span class="sr">{detail}</span>
	</span>
{/snippet}

<Shortcuts
	onview={switchTo}
	onbranch={openBranches}
	onhelp={() => (helping = !helping)}
	ondismiss={dismiss}
	modal={helping}
/>

{#if helping}
	<KeyHelp
		views={views.map((view) => view.name)}
		branch={branched}
		onclose={() => (helping = false)}
	/>
{/if}

<!-- Three zones: whose tasks on the left, which view in the middle, how fresh
     the reading is on the right. -->
<header>
	<div class="identity">
		<a class="brand" href={resolve('/')}><Mark size={18} /> tatr</a>
		{#if branched}
			<BranchField {ref} bind:open={branching} />
		{:else}
			<span class="repo">{repo.name}</span>
		{/if}
	</div>

	<nav class="segmented">
		{#each views as view (view.base)}
			<a
				href={view.base + view.search}
				aria-current={page.url.pathname === view.base ? 'page' : undefined}>{view.name}</a
			>
		{/each}
	</nav>

	<div class="reading">
		{#if repo.phase === 'ready'}
			<span class="age">
				{#if following}
					following
				{:else}
					{repo.fromCache ? 'cached' : 'read'}
					{describeAge(repo.storedAt)}
				{/if}
				<!-- The reading stayed; only renewing it failed, which is worth one
				     clause rather than a panel over tasks that are still true. The
				     source's own sentence is the detail. -->
				{#if repo.refreshFailure}
					{@render clause(
						`not refreshed: ${FAILURE_HEADINGS[repo.refreshFailure.kind]}`,
						repo.refreshFailure.message
					)}
				{/if}
				<!-- What the reading could not use. Said here because it is a fact about
				     the reading rather than about a view, and because a count that does
				     not match `tatr ls` is worse than a count with a reason beside it.
				     The folders and the reasons are the detail. -->
				{#if repo.skipped.length > 0}
					{@render clause(
						`${folders(repo.skipped.length)} skipped`,
						repo.skipped.map((one) => `${one.id}: ${one.reason}`).join('\n')
					)}
				{/if}
			</span>
			{#if rereadable}
				<!-- The reading stays on screen while the next one is taken, so the
				     button is what says one is under way. -->
				<button class="action" disabled={repo.refreshing} onclick={() => repo.refresh()}>
					{#if repo.refreshing}Refreshing…{:else}Refresh{/if}
				</button>
			{:else if reopener}
				<!-- A reading that cannot be taken again: a directory input hands over
				     files and no way back to the folder they came from, so refreshing
				     means asking for it again rather than pretending. -->
				<reopener.control label="Reopen…" />
			{/if}
		{/if}
	</div>
</header>

{@render children()}

<style>
	/* A floating pill rather than a ruled band: the bar is a thing on the page,
	   like the cards under it, and a band edge-to-edge would be the only hard
	   line left on a site made of rounded surfaces. */
	/* The sides share what is left equally, so the views sit at the middle of
	   the page, over the column every view centres below it, however long the
	   repository's name or the reading's age. When one side outgrows its share
	   the views give way rather than overlap it. */
	header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.5rem 1rem;
		margin: 1rem 1.5rem 0;
		padding: 0.375rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	/* Kept on one line, so a side that needs more room takes it from the
	   views' centring rather than wrapping inside the pill. */
	.identity,
	.reading {
		display: flex;
		align-items: center;
		gap: 0.25rem 1rem;
		white-space: nowrap;
	}

	/* Pulled into the bar's padding, so Refresh sits concentric with the pill's
	   end while the padding itself stays even and the middle stays the middle. */
	.reading {
		justify-content: flex-end;
		margin-right: -0.875rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-height: var(--target);
		font-size: 1.0625rem;
		font-weight: 800;
		color: var(--fg);
	}

	.repo {
		font-family: var(--font-mono);
		color: var(--ink-2);
	}

	.age {
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.stale {
		color: var(--warning);
	}

	/* Too narrow for three zones on one line: the views take a row of their
	   own, and the bar a card's radius, since a pill two rows tall bulges. */
	@media (max-width: 64rem) {
		header {
			grid-template-columns: 1fr auto;
			border-radius: var(--radius-xl);
		}

		nav {
			grid-row: 2;
			grid-column: 1 / -1;
			justify-self: center;
		}

		.identity,
		.reading {
			flex-wrap: wrap;
			white-space: normal;
		}
	}
</style>
