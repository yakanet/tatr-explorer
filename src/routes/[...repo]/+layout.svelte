<script lang="ts">
	import { setContext } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import KeyHelp from '#lib/components/KeyHelp.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import Shortcuts from '#lib/components/Shortcuts.svelte';
	import FolderPicker from '#lib/components/FolderPicker.svelte';
	import { formatRepoPath, isLocal } from '#lib/repo/ref.ts';
	import { openSource } from '#lib/sources/open.ts';
	import { RepositoryState, describeAge, REPOSITORY } from '#lib/state/repository.svelte.ts';
	import { QUERY, QueryState } from '#lib/state/query.svelte.ts';

	let { data, children } = $props();
	const ref = $derived(data.ref);

	// One state for every view, so navigating between them costs nothing.
	const repo = new RepositoryState();
	setContext(REPOSITORY, repo);

	// One query too: the charts filter the list and vice versa. A link that
	// carries a query sets it, so the dashboard's counts and bars can be plain
	// links; typing rewrites the URL without navigating, so it never comes back
	// through here to trim the text under the cursor.
	const query = new QueryState();
	query.read(page.url.searchParams);
	// Before the new page renders rather than after, so it does not draw once
	// with the old query only to be filtered again.
	onNavigate(({ to }) => {
		if (to) query.read(to.url.searchParams);
	});
	setContext(QUERY, query);

	$effect(() => {
		const current = ref;
		repo.load(current);
		return () => repo.abort();
	});

	const path = $derived(formatRepoPath(ref));
	/**
	 * What the header calls this repository: the URL form for a forge, branch and
	 * all, and for a folder the name the reading found — no URL carries it.
	 */
	const label = $derived(isLocal(ref) ? repo.name : path);

	/**
	 * Whether Refresh means anything here, which only the source knows.
	 *
	 * Recomputed when the reference changes, and a folder being opened is not a
	 * change of reference — it is module state, which nothing here observes. It
	 * holds because every way of opening a folder ends in a navigation that
	 * renews `ref`; if one ever does not, this is where it will read `Refresh`
	 * over a folder that cannot be refreshed.
	 */
	const repeatable = $derived(openSource(ref)?.repeatable ?? false);

	let helping = $state(false);

	/**
	 * The query travels with the link, so a filtered view stays shareable — but
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

	/** `1`-`9` counts positions in the nav, so an absent view simply does nothing. */
	function switchTo(index: number) {
		const view = views[index];
		if (view) goto(view.base + view.search);
	}

	/** Escape closes what is open, in the order a reader would expect. */
	function dismiss() {
		if (helping) helping = false;
	}
</script>

<Shortcuts
	onview={switchTo}
	onhelp={() => (helping = !helping)}
	ondismiss={dismiss}
	modal={helping}
/>

{#if helping}
	<KeyHelp views={views.map((view) => view.name)} onclose={() => (helping = false)} />
{/if}

<!-- Three zones: whose tasks on the left, which view in the middle, how fresh
     the reading is on the right. -->
<header>
	<div class="identity">
		<a class="brand" href={resolve('/')}><Mark size={18} /> tatr</a>
		<span class="repo">{label}</span>
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
				{repo.fromCache ? 'cached' : 'read'}
				{describeAge(repo.storedAt)}
				<!-- The reading stayed; only renewing it failed, which is worth one
				     clause rather than a panel over tasks that are still true. -->
				{#if repo.refreshFailure}
					<span class="stale">· not refreshed: {repo.refreshFailure.message}</span>
				{/if}
				<!-- What the reading could not use. Said here because it is a fact about
				     the reading rather than about a view, and because a count that does
				     not match `tatr ls` is worse than a count with a reason beside it.
				     The folders and the reasons are in the tooltip: naming them on the
				     header would push the whole line around for a case that is rare. -->
				{#if repo.skipped.length > 0}
					<span
						class="stale"
						title={repo.skipped.map((one) => `${one.id}: ${one.reason}`).join('\n')}
					>
						· {repo.skipped.length}
						{repo.skipped.length === 1 ? 'folder' : 'folders'} skipped
					</span>
				{/if}
			</span>
			{#if repeatable}
				<button class="action" onclick={() => repo.load(ref, true)}>Refresh</button>
			{:else}
				<!-- A reading that cannot be taken again: a directory input hands over
				     files and no way back to the folder they came from, so refreshing
				     means asking for it again rather than pretending. -->
				<FolderPicker label="Reopen…" />
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
	   the page, over the column every view centres below it — however long the
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
