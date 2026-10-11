<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import QueryBar from '#lib/components/QueryBar.svelte';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { taskHref } from '#lib/repo/hrefs.ts';
	import { renderTitle } from '#lib/render/markdown.ts';
	import { tagHue } from '#lib/render/tag-hue.ts';
	import { QUERY, type QueryState } from '#lib/state/query.svelte.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { columnOf, moveTo, toColumns, type Column, type ColumnKey } from '#lib/tatr/board.ts';
	import { byTag } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	const query = getContext<QueryState>(QUERY);

	// The query filters each column without its status, because closed tasks
	// have their own column and the status would empty it. `matches` leaves the
	// status out, and the query bar hides its status switch.
	const columns = $derived(toColumns(repo.tasks, (task) => query.matches(task)));

	const matched = $derived(columns.reduce((n, column) => n + column.tasks.length, 0));
	const pool = $derived(columns.reduce((n, column) => n + column.total, 0));

	// Tag counts cover every task because the board shows every task.
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
		goto(url, { shallow: true, replace: true });
	}

	const describe = (tag: string) => repo.tags.descriptions.get(tag) ?? '';

	/** The task whose card is being dragged, or null. */
	let dragged = $state.raw<Task | null>(null);
	/** The column the card is held over, marked as where it would land. */
	let target = $state<ColumnKey | null>(null);

	function picked(event: DragEvent, task: Task) {
		dragged = task;
		if (!event.dataTransfer) return;
		event.dataTransfer.effectAllowed = 'move';
		// Firefox starts a drag only once it carries data.
		event.dataTransfer.setData('text/plain', task.id);
	}

	/** Accepts the card over any column but its own. */
	function over(event: DragEvent, column: ColumnKey) {
		if (!dragged || columnOf(dragged) === column) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		target = column;
	}

	function left(event: DragEvent & { currentTarget: HTMLElement }, column: ColumnKey) {
		// Moving onto a card inside the column fires `dragleave` on the column too.
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		if (target === column) target = null;
	}

	function dropped(event: DragEvent, column: Column) {
		event.preventDefault();
		const card = dragged;
		ended();
		if (card) repo.edit(card.id, moveTo(column.key), `moved to ${column.name}`);
	}

	function ended() {
		dragged = null;
		target = null;
	}
</script>

<svelte:head>
	<title>{repo.name} · board</title>
</svelte:head>

<main>
	<QueryBar {query} {matched} {pool} tags={tagOptions} onchange={syncUrl} chooseStatus={false} />
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		{#if repo.editable}
			<p class="editing">
				Drag a card to another column to rewrite its <code>TASK.md</code>, as the CLI would.
			</p>
		{/if}
		<div class="board">
			{#each columns as column (column.key)}
				<section
					role="group"
					aria-label={column.name}
					class="column {column.key}"
					class:target={target === column.key}
					ondragover={(event) => over(event, column.key)}
					ondragleave={(event) => left(event, column.key)}
					ondrop={(event) => dropped(event, column)}
				>
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
									<!-- The whole card is the link and the key row, so `j`/`k` and
									     Enter work on the board without code of its own. A card that
									     cannot move does not drag at all, rather than drag as a link
									     and land nowhere. -->
									<a
										href={taskHref(ref, task.id)}
										data-key-row
										class:done={column.key === 'done'}
										class:dragging={dragged?.id === task.id}
										draggable={repo.canEdit(task)}
										ondragstart={(event) => picked(event, task)}
										ondragend={ended}
									>
										<span class="prio" class:done={column.key === 'done'}>
											{task.priority}
										</span>
										<span class="title">{@html renderTitle(task, repo.assetUrl)}</span>
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
		--column: 84rem;
		padding-bottom: 4rem;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--card-gap);
		align-items: start;
	}

	/* Below 60rem the columns stack rather than shrink narrower than a title
	   needs. */
	@media (max-width: 60rem) {
		.board {
			grid-template-columns: minmax(0, 1fr);
		}

		/* Stacked columns scroll with the page, because a scroll box inside a
		   scrolling page is hard to use on a phone. */
		.column {
			max-height: none;
		}

		ul {
			overflow-y: visible;
		}
	}

	/* Each column is a tinted well that holds the cards. In progress gets the
	   accent colour because it is the stage a reader looks for first. */
	.column {
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 0.875rem;
		border-radius: var(--radius-xl);
		background: var(--tint);
		/* Each column scrolls on its own, so a long Done column does not push the
		   other headers off the page. `j`/`k` rely on it too, since
		   scrollIntoView scrolls the nearest scroll box. */
		max-height: calc(100vh - 11.25rem);
	}

	.column.progress {
		background: var(--accent-wash);
	}

	/* The column a dragged card would land in. */
	.column.target {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}

	.editing {
		margin: 0 0 1rem;
		font-size: 0.8125rem;
		color: var(--ink-2);
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

	/* The column's total before filtering is quieter than the matched count. */
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

	li a[draggable='true'] {
		cursor: grab;
	}

	/* The card left behind while its ghost is dragged. */
	li a.dragging {
		opacity: 0.4;
	}

	/* Done cards have no fill and no shadow, so they recede behind open work. */
	li a.done {
		background: none;
		box-shadow: none;
	}

	.prio.done {
		color: var(--muted);
		background: var(--surface);
	}

	.title {
		line-height: 1.45;
		padding-top: 0.15rem;
	}

	/* The moved badge sits on the tags' line rather than after the title, where
	   it would land alone on a new line whenever the title fills the card. */
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
