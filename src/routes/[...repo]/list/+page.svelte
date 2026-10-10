<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import QueryBar from '#lib/components/QueryBar.svelte';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { formatRepoPath } from '#lib/repo/ref.ts';
	import { renderInline } from '#lib/render/markdown.ts';
	import { tagHue } from '#lib/render/tag-hue.ts';
	import { QUERY, type QueryState } from '#lib/state/query.svelte.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { byTag } from '#lib/tatr/stats.ts';
	import type { Task } from '#lib/tatr/task.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);
	// Shared with the dashboard, so a filter set on a chart survives the move here.
	const query = getContext<QueryState>(QUERY);

	const visible = $derived(
		query
			.apply(repo.tasks)
			// Priority descending, as `tatr ls` does by default.
			.toSorted((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
	);
	// What the status admits, before the text narrows it.
	const admitted = $derived(query.pool(repo.tasks));
	const pool = $derived(admitted.length);

	// Counted over what the reader is actually looking at, so the tally beside a
	// tag agrees with the list they get by picking it.
	const tagOptions = $derived(
		byTag(admitted).map(({ tag, count }) => ({
			name: tag,
			description: repo.tags.descriptions.get(tag),
			count
		}))
	);

	function syncUrl() {
		const url = new URL(page.url.href);
		url.search = query.searchOf('list');
		goto(url, { shallow: true, replace: true });
	}

	// An address that arrived without a status (typed, or from before there was
	// one) is rewritten to carry the status in force, so coming back to it
	// through history shows what was shown rather than whatever was chosen since.
	onMount(syncUrl);

	function toggleTag(tag: string) {
		query.toggle(`:${tag}`);
		syncUrl();
	}

	const describe = (tag: string) => repo.tags.descriptions.get(tag) ?? '';
	const taskHref = (id: string) =>
		resolve('/[...repo]/task/[id]', { repo: formatRepoPath(ref), id });
	const inline = (task: Task) =>
		renderInline(task.title, { ref, branch: repo.branch, taskId: task.id });
</script>

<svelte:head>
	<title>{repo.name} · list</title>
</svelte:head>

<main>
	<QueryBar {query} matched={visible.length} {pool} tags={tagOptions} onchange={syncUrl} />
	<RepoStatus {repo} {ref} />

	{#if repo.phase === 'ready'}
		{#if visible.length === 0}
			<p class="empty">No task matches this query.</p>
		{:else}
			<!-- The card scrolls rather than the page: on a phone the columns are
			     wider than the screen, and a page that slides sideways loses the
			     header with it. -->
			<div class="sheet panel">
				<table>
					<thead>
						<tr>
							<th class="c-status"><span class="sr">Status</span></th>
							<th class="c-prio">prio</th>
							<th>title</th>
							<th class="c-tags">tags</th>
							<th class="c-id">id</th>
						</tr>
					</thead>
					<tbody>
						{#each visible as task (task.id)}
							{@const moves = repo.changes?.moved.get(task.id)}
							<tr title={moves && repo.describeMoves(moves)} class:closed={task.closed}>
								<td class="c-status">
									{#if task.closed}
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="icon closed"
											role="img"
											aria-label={task.status}><path d="M20 6 9 17l-5-5" /></svg
										>
									{:else}
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											class="icon open"
											role="img"
											aria-label={task.status}><circle cx="12" cy="12" r="8" /></svg
										>
									{/if}
								</td>
								<td class="c-prio"><span class="prio">{task.priority}</span></td>
								<td class="title">
									<a href={taskHref(task.id)} data-key-row>{@html inline(task)}</a>
									{#if moves}<span data-moved>{moves[0]}</span>{/if}
								</td>
								<td class="c-tags">
									{#each task.tags as tag (tag)}
										<button
											class="tag"
											data-hue={tagHue(tag)}
											onclick={() => toggleTag(tag)}
											title={describe(tag)}
										>
											{tag}
										</button>
									{/each}
								</td>
								<td class="c-id"><code class="id">{task.id}</code></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 70rem;
	}

	/* A card like every other surface, holding the table so the table can be
	   wider than a phone without the page scrolling sideways. */
	.sheet {
		overflow-x: auto;
	}

	table {
		width: 100%;
		min-width: 40rem;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--muted);
		padding: 0.75rem 0.9rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	td {
		padding: 0.55rem 0.9rem;
		border-top: 1px solid var(--border);
		vertical-align: middle;
	}

	tbody tr:first-child td {
		border-top: none;
	}

	tbody tr:hover {
		background: var(--tint);
	}

	.c-status {
		width: 1.75rem;
	}

	.c-prio {
		width: 3.5rem;
	}

	/* Inline after the title here, so the word space it inherits from the flow is
	   not quite enough to clear a bordered badge. */
	.title [data-moved] {
		margin-left: 0.25rem;
	}

	.c-tags {
		width: 14rem;
		line-height: 1.9;
	}

	.c-id {
		width: 10.5rem;
	}

	.icon {
		display: block;
		width: 14px;
		height: 14px;
	}

	.icon.open {
		color: var(--accent);
	}

	.icon.closed {
		color: var(--muted);
	}

	.title {
		line-height: 1.45;
	}

	.title a {
		color: inherit;
	}

	.title a:hover {
		color: var(--accent-text);
	}

	/* A closed task is still worth reading, one step quieter. */
	tr.closed .title {
		color: var(--ink-2);
	}

	.tag {
		margin-right: 0.25rem;
		cursor: pointer;
	}

	.tag:hover {
		color: var(--fg);
	}
</style>
