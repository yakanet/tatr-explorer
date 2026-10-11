<script lang="ts">
	import { getContext } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import EditSheet from '#lib/components/EditSheet.svelte';
	import Properties from '#lib/components/Properties.svelte';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import Article from './Article.svelte';
	import Attachments from './Attachments.svelte';
	import ForgeLink from './ForgeLink.svelte';
	import References from './References.svelte';
	import { listHref, taskLinks } from '#lib/repo/hrefs.ts';
	import { loadTaskDescription } from '#lib/sources/load.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { askBeforeLeaving } from '#lib/state/unsaved.ts';
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

	const renderOptions = $derived({
		assetUrl: repo.assetUrl,
		taskId: id,
		taskUrl: taskLinks(ref, repo.tasks, id)
	});

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

	askBeforeLeaving(() => dirty, 'Leave this task without saving your changes?');
	// The page stays mounted from one task to the next, and so would the sheet.
	onNavigate(() => {
		sheet = null;
	});
</script>

<svelte:head>
	<title>{task?.title ?? id} · {repo.name}</title>
</svelte:head>

<main class="task-page">
	{#if repo.phase !== 'ready'}
		<!-- RepoStatus shows the progress or the failure, as on every other view, so
		     a local folder lost on reload is offered again rather than waited for. -->
		<div class="wide"><RepoStatus {repo} {ref} /></div>
	{:else if !task}
		<section class="panel wide">
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
				<Properties properties={task.properties} {known} bind:fields={sheet.draft} />
			{:else}
				<Properties properties={task.properties} />
			{/if}
			<References {task} tasks={repo.tasks} {ref} options={renderOptions} />
			<Attachments attachments={task.attachments ?? []} options={renderOptions} />
			<ForgeLink url={repo.fileUrl(taskPath(id))} />
			<p><a href={listHref(ref)}>← Back to the list</a></p>
		</aside>
	{/if}
</main>

<style>
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
