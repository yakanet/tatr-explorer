<script lang="ts">
	import { getContext } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import QueryBar from '#lib/components/QueryBar.svelte';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { renderInline } from '#lib/render/markdown.ts';
	import { tagHue } from '#lib/render/tag-hue.ts';
	import { QUERY, type QueryState } from '#lib/state/query.svelte.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { toColumns } from '#lib/tatr/board.ts';
	import { byTag } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	// Shared with the list, so a filter set in one is still there in the other.
	const query = getContext<QueryState>(QUERY);

	/*
	 * The query narrows each column, and the closed toggle has no say here.
	 *
	 * Closed tasks are a column on this view, so hiding them would empty a column
	 * headed "closed" — a question the board answers by its shape. The bar drops
	 * the switch rather than reinterpreting it, and `matches` is the query without
	 * the status filter that `apply` would have imposed.
	 */
	const columns = $derived(toColumns(repo.tasks, (task) => query.matches(task)));

	const matched = $derived(columns.reduce((n, column) => n + column.tasks.length, 0));
	const pool = $derived(columns.reduce((n, column) => n + column.total, 0));

	// Counted over everything, the board showing everything.
	const tagOptions = $derived(
		byTag(repo.tasks).map(({ tag, count }) => ({
			name: tag,
			description: repo.tags.descriptions.get(tag),
			count
		}))
	);

	function syncUrl() {
		const url = new URL(page.url.href);
		url.search = query.searchOf('board');
		replaceState(url, page.state);
	}

	const taskHref = (id: string) =>
		resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
	const inline = (task: Task) =>
		renderInline(task.title, { ref, branch: repo.branch, taskId: task.id });
	const describe = (tag: string) => repo.tags.descriptions.get(tag) ?? '';
</script>

<svelte:head>
	<title>{repo.name} — board</title>
</svelte:head>

<main>
	<QueryBar {query} {matched} {pool} tags={tagOptions} onchange={syncUrl} chooseStatus={false} />
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		<div class="board">
			{#each columns as column (column.key)}
				<section class="column {column.key}">
					<header>
						<h2>{column.name}</h2>
						<span class="tally mono">
							{column.tasks.length}{#if column.tasks.length !== column.total}<span class="of"
									>&thinsp;/&thinsp;{column.total}</span
								>{/if}
						</span>
						<span class="hint">{column.hint}</span>
					</header>

					{#if column.tasks.length === 0}
						<p class="empty">Nothing here.</p>
					{:else}
						<ul>
							{#each column.tasks as task (task.id)}
								{@const moves = repo.changes?.moved.get(task.id)}
								<li>
									<!-- The card is the link, so `j`/`k` and Enter carry the board
									     without a line of its own. -->
									<a href={taskHref(task.id)} data-key-row class:done={column.key === 'done'}>
										<span class="prio" class:muted={column.key === 'done'}>
											{task.priority}
										</span>
										<span class="title">{@html inline(task)}</span>
										{#if moves || task.tags.length > 0}
											<span class="meta">
												{#if moves}
													<span data-moved title={repo.describeMoves(moves)}>{moves[0]}</span>
												{/if}
												{#each task.tags as tag (tag)}
													<span class="tag" data-hue={tagHue(tag)} title={describe(tag)}>{tag}</span
													>
												{/each}
											</span>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 84rem;
		padding-bottom: 4rem;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--card-gap);
		align-items: start;
	}

	/* Three columns is the point of the view, so they stack rather than shrink
	   past the width a title needs. */
	@media (max-width: 60rem) {
		.board {
			grid-template-columns: minmax(0, 1fr);
		}

		/* Stacked, the columns are already in one scrolling page: a box inside a
		   box is what makes a phone unusable. */
		.column {
			max-height: none;
		}

		ul {
			overflow-y: visible;
		}
	}

	/* Each column is a well the cards sit in. In progress is the one with
	   colour, being the stage a reader looks for first. */
	.column {
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 0.875rem;
		border-radius: var(--radius-xl);
		background: var(--tint);
		/* Done holds 46 cards on tsoding/tatr, so letting the page grow to fit it
		   scrolls the other two headers off the top — and a board whose columns
		   cannot be compared is a list. Each scrolls on its own instead, which is
		   also what `j`/`k` expect: scrollIntoView finds the nearest scroll box. */
		max-height: calc(100vh - 13rem);
	}

	.column.progress {
		background: var(--accent-wash);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.5rem;
		padding: 0 0.4rem 0.6rem;
	}

	h2 {
		margin: 0;
		font-size: 0.875rem;
	}

	.tally {
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	/* What the query set aside, kept quieter than what it kept. */
	.of {
		color: var(--muted);
	}

	.hint {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--muted);
		text-align: right;
	}

	ul {
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		display: grid;
		gap: 0.5rem;
		overflow-y: auto;
		/* Room for the focus ring, which the overflow would otherwise clip. */
		margin-inline: -0.25rem;
	}

	li a {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: 0.35rem 0.65rem;
		padding: 0.75rem 0.875rem;
		color: var(--fg);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}

	li a:hover {
		border-color: var(--accent-line);
	}

	/* Done is context rather than subject, so its cards recede: no fill, no lift. */
	li a.done {
		background: none;
		box-shadow: none;
	}

	.prio.muted {
		color: var(--muted);
		background: var(--surface);
	}

	.title {
		line-height: 1.45;
		padding-top: 0.15rem;
	}

	/* A card's title wraps, and a badge sitting in that flow lands alone on a
	   line of its own as soon as the last word fills the card. Down here it is
	   the first thing on a line that already exists, beside the tags. */
	.meta {
		grid-column: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.empty {
		margin: 0.25rem 0.4rem 0.4rem;
	}
</style>
