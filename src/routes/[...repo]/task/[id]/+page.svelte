<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import Article from './Article.svelte';
	import Attachments from './Attachments.svelte';
	import ForgeLink from './ForgeLink.svelte';
	import Properties from './Properties.svelte';
	import References from './References.svelte';
	import { listHref, taskHref } from '#lib/repo/hrefs.ts';
	import { loadTaskDescription } from '#lib/sources/load.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import type { Edit } from '#lib/tatr/task-file.ts';
	import { taskPath } from '#lib/tatr/task.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	const id = $derived(page.params.id ?? '');
	const task = $derived(repo.tasks.find((candidate) => candidate.id === id));

	// Descriptions are not cached, so a task opened from a cached repository
	// fetches its own.
	let body = $state<string | null>(null);
	let loadingBody = $state(false);

	$effect(() => {
		const current = task;
		if (!current) return;
		if (current.description !== undefined) {
			body = current.description;
			// A refresh can replace the task with one that carries its description
			// while a fetch is in flight, so the loading flag is cleared here too.
			loadingBody = false;
			return;
		}
		const source = repo.source;
		if (!source) return;
		loadingBody = true;
		let cancelled = false;
		loadTaskDescription(source, current.id).then((text) => {
			if (cancelled) return;
			body = text ?? '';
			loadingBody = false;
		});
		return () => {
			cancelled = true;
		};
	});

	/**
	 * The link for a task id found in the text. Only ids of other tasks in this
	 * repository become links: an unknown id would lead to `No such task`, and
	 * this task's own id to this page. The References panel uses the same list,
	 * so the body links what it lists.
	 */
	function taskUrl(other: string) {
		if (other !== id && repo.tasks.some((candidate) => candidate.id === other)) {
			return taskHref(ref, other);
		}
		return null;
	}

	const renderOptions = $derived({ assetUrl: repo.assetUrl, taskId: id, taskUrl });

	/** Rewrites this task's file, or is undefined where it cannot be edited. */
	const onedit = $derived.by(() => {
		if (!task || !repo.canEdit(task)) return undefined;
		return (edit: Edit, what: string) => repo.edit(id, edit, what);
	});
</script>

<svelte:head>
	<title>{task?.title ?? id} · {repo.name}</title>
</svelte:head>

<main>
	{#if repo.phase !== 'ready'}
		<!-- RepoStatus shows the progress or the failure, as on every other view, so
		     a local folder lost on reload is offered again rather than waited for. -->
		<div class="wide"><RepoStatus {repo} {ref} /></div>
	{:else if !task}
		<section class="panel">
			<h2>No such task</h2>
			<p>This repository has no task <code>{id}</code>.</p>
			<p><a href={listHref(ref)}>Back to the list</a></p>
		</section>
	{:else}
		<Article {task} {body} {loadingBody} options={renderOptions} />

		<aside>
			<Properties {task} {onedit} />
			<References {task} tasks={repo.tasks} {ref} options={renderOptions} />
			<Attachments attachments={task.attachments ?? []} options={renderOptions} />
			<ForgeLink url={repo.fileUrl(taskPath(id))} />
			<p><a href={listHref(ref)}>← Back to the list</a></p>
		</aside>
	{/if}
</main>

<style>
	main {
		--column: 70rem;
		display: grid;
		grid-template-columns: 1fr 18rem;
		gap: var(--card-gap);
		align-items: start;
	}

	/* The status and not-found panels span both columns because they belong to
	   neither the article nor the sidebar. `.wide` wraps RepoStatus, whose
	   markup this page cannot style. */
	.wide,
	main > section {
		grid-column: 1 / -1;
	}

	/* Below 50rem the sidebar goes under the article rather than squeezing it
	   or pushing the page sideways. */
	@media (max-width: 50rem) {
		main {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.panel {
		padding: 1.5rem 1.75rem;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: var(--card-gap);
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
	}
</style>
