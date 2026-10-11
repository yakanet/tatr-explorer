<script lang="ts">
	import { getContext } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import Article from './Article.svelte';
	import Attachments from './Attachments.svelte';
	import EditSheet from './EditSheet.svelte';
	import ForgeLink from './ForgeLink.svelte';
	import Properties from './Properties.svelte';
	import References from './References.svelte';
	import { listHref, taskHref } from '#lib/repo/hrefs.ts';
	import { loadTaskDescription } from '#lib/sources/load.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { differing, fieldsOf, withFields, type TaskFields } from '#lib/tatr/task-fields.ts';
	import { tagOptions } from '#lib/tatr/stats.ts';
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

	/** The editing sheet: the fields it was opened on, and the draft. Null while the task is read. */
	let sheet = $state<{ opened: TaskFields; draft: TaskFields } | null>(null);
	let saving = $state(false);

	/** The fields of the reading on screen, which a sheet opens on. */
	const current = $derived.by(() => {
		if (!task || body === null) return null;
		return fieldsOf({ title: task.title, properties: task.properties, body });
	});
	const dirty = $derived(sheet !== null && differing(sheet.opened, sheet.draft).length > 0);
	const moved = $derived(
		sheet !== null && current !== null && differing(sheet.opened, current).length > 0
	);

	/** Opens the editing sheet, or is undefined where the task cannot be edited. */
	const onedit = $derived.by(() => {
		if (!task || !repo.canEdit(task) || !current) return undefined;
		return () => (sheet = { opened: current, draft: { ...current } });
	});

	/** The repository's tags, which the tags field offers; only a sheet needs them. */
	const known = $derived.by(() => {
		if (!sheet) return [];
		return tagOptions(repo.tasks, repo.tags.descriptions);
	});

	async function save() {
		if (!sheet || saving) return;
		saving = true;
		// The draft as it stands now: what is typed during the save is not written.
		const { opened, draft } = $state.snapshot(sheet);
		const saved = await repo.edit(id, withFields(opened, draft), 'saved');
		saving = false;
		if (saved) sheet = null;
	}

	beforeNavigate(({ cancel, type }) => {
		if (dirty) {
			// Leaving the site, the browser asks by itself once the navigation is cancelled.
			if (type === 'leave') return cancel();
			if (!confirm('Leave this task without saving your changes?')) return cancel();
		}
		// The page stays mounted from one task to the next, and so would the sheet.
		sheet = null;
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
		{#if sheet}
			<EditSheet
				bind:fields={sheet.draft}
				saveable={dirty && repo.canEdit(task)}
				{saving}
				{moved}
				options={renderOptions}
				onsave={save}
				oncancel={() => (sheet = null)}
			/>
		{:else}
			<Article {task} {body} {loadingBody} options={renderOptions} {onedit} />
		{/if}

		<aside>
			{#if sheet}
				<Properties {task} {known} bind:fields={sheet.draft} />
			{:else}
				<Properties {task} />
			{/if}
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
