<script lang="ts">
	import { setContext } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BranchField from '#lib/components/BranchField.svelte';
	import KeyHelp from '#lib/components/KeyHelp.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import Shortcuts from '#lib/components/Shortcuts.svelte';
	import { reopenerOf } from '#lib/components/reopeners.ts';
	import { counted } from '#lib/plural.ts';
	import { formatRepoPath, isForgeRef, type ForgeRef } from '#lib/repo/ref.ts';
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

	// The layout shares one repository state with every view, so switching views
	// does not read the repository again.
	const repo = new RepositoryState();
	setContext(REPOSITORY, repo);

	// The layout also shares one query with every view, and an address that
	// carries a query sets it, so the overview's counts and bars only lead to one.
	// A shallow `goto` runs the navigation hooks in SvelteKit 3. The list and the
	// board call one as the reader types, and reading the trimmed URL back would
	// delete the space under the cursor, so that `goto` is skipped. Going back to
	// such a URL is also shallow, and that one must be read.
	const query = new QueryState();
	query.read(page.url.searchParams);
	// `onNavigate` runs before the new page renders, so the page does not draw
	// once with the old query and again with the new one.
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
	/** The forge reference to pick a branch on, or null when the source has no branches. */
	const branchRef = $derived.by((): ForgeRef | null => {
		if (!isBranched(repo.source) || !isForgeRef(ref)) return null;
		return ref;
	});
	/** Opens the branch menu from the shortcut, or is undefined when there are no branches. */
	const openBranches = $derived.by(() => {
		if (branchRef === null) return undefined;
		return () => (branching = true);
	});
	/** The control that opens the source again, or null when reading it again is enough. */
	const reopener = $derived(reopenerOf(ref));

	/** Whether the source can be read again, which decides whether Refresh is shown. */
	const rereadable = $derived(isRereadable(repo.source));
	/** Whether the source reports its own changes, in which case the reading's age is not shown. */
	const following = $derived(isFollowable(repo.source));

	$effect(() => repo.follow());

	let helping = $state(false);

	/**
	 * Each view's link carries the part of the query that view uses, so a
	 * filtered view stays shareable. The rest stays in memory and returns with
	 * the next view that uses it.
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

	/** Opens the view at this position in the nav; a position with no view does nothing. */
	function switchTo(index: number) {
		const view = views[index];
		if (view) goto(view.base + view.search);
	}

	/** Closes the key help when the reader presses Escape. */
	function dismiss() {
		if (helping) helping = false;
	}

	/** Marks the nav link of the view on screen. */
	function currentOf(view: { base: string }): 'page' | undefined {
		if (page.url.pathname === view.base) return 'page';
		return undefined;
	}
</script>

<!-- A clause in the reading's line, with its detail in a tooltip and read out
     to screen readers. The detail stays out of the line so a rare case does not
     make the header shift. -->
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
		branch={branchRef !== null}
		onclose={() => (helping = false)}
	/>
{/if}

<!-- The header has three zones: the repository on the left, the views in the
     middle, and the reading's age on the right. -->
<header>
	<div class="identity">
		<a class="brand" href={resolve('/')}><Mark size={18} /> tatr</a>
		{#if branchRef}
			<BranchField ref={branchRef} bind:open={branching} />
		{:else}
			<span class="repo">{repo.name}</span>
		{/if}
	</div>

	<nav class="segmented">
		{#each views as view (view.base)}
			<a href={view.base + view.search} aria-current={currentOf(view)}>{view.name}</a>
		{/each}
	</nav>

	<div class="reading">
		{#if repo.phase === 'ready'}
			<span class="age">
				{#if following}
					following
				{:else}
					{#if repo.fromCache}cached{:else}read{/if}
					{describeAge(repo.storedAt)}
				{/if}
				<!-- A failed refresh keeps the previous reading, so it gets one clause
				     rather than an error panel over tasks that are still valid. The
				     source's message is the detail. -->
				{#if repo.refreshFailure}
					{@render clause(
						`not refreshed: ${FAILURE_HEADINGS[repo.refreshFailure.kind]}`,
						repo.refreshFailure.message
					)}
				{/if}
				<!-- The folders the reading skipped, reported in the header because they
				     concern every view, and because a count that differs from `tatr ls`
				     needs its reason beside it. The folders and reasons are the detail. -->
				{#if repo.skipped.length > 0}
					{@render clause(
						`${counted(repo.skipped.length, 'folder', 'folders')} skipped`,
						repo.skipped.map((one) => `${one.id}: ${one.reason}`).join('\n')
					)}
				{/if}
			</span>
			{#if rereadable}
				<!-- The previous reading stays on screen during a refresh, so the
				     button is the only sign that one is under way. -->
				<button class="action" disabled={repo.refreshing} onclick={() => repo.refresh()}>
					{#if repo.refreshing}Refreshing…{:else}Refresh{/if}
				</button>
			{:else if reopener}
				<!-- A source that cannot be read again offers to open it again instead:
				     a directory input hands over files but no way back to their folder. -->
				{@const Control = reopener.control}
				<Control label="Reopen…" />
			{/if}
		{/if}
	</div>
</header>

{@render children()}

<style>
	/* The header is a floating pill like the cards under it, because an
	   edge-to-edge band would be the only hard line on a site of rounded
	   surfaces. The two sides share the remaining width equally, so the views
	   stay centred over the column below whatever the side lengths. */
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

	/* The sides stay on one line, so a side that needs more room moves the
	   views off centre rather than wrapping inside the pill. */
	.identity,
	.reading {
		display: flex;
		align-items: center;
		gap: 0.25rem 1rem;
		white-space: nowrap;
	}

	/* The negative margin pulls Refresh into the header's padding, so it sits
	   concentric with the pill's rounded end while the padding stays even. */
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

	/* Below 64rem the three zones do not fit on one line. The views take their
	   own row, and the header takes a card's radius because a two-row pill
	   looks swollen. */
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
