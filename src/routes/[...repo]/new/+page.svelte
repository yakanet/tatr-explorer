<script lang="ts">
	// Creates a task from the editing sheet opened empty, where the source writes.
	import { getContext } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import EditSheet from '#lib/components/EditSheet.svelte';
	import Properties from '#lib/components/Properties.svelte';
	import RepoStatus from '#lib/components/RepoStatus.svelte';
	import { listHref, taskHref, taskLinks } from '#lib/repo/hrefs.ts';
	import { REPOSITORY, type RepositoryState } from '#lib/state/repository.svelte.ts';
	import { Sheet } from '#lib/state/sheet.svelte.ts';
	import { askBeforeLeaving } from '#lib/state/unsaved.ts';
	import { NEW_TASK, UNTITLED } from '#lib/tatr/task-fields.ts';

	let { data } = $props();
	const ref = $derived(data.ref);
	const repo = getContext<RepositoryState>(REPOSITORY);

	const sheet = new Sheet(NEW_TASK, repo);
	let saving = $state(false);
	/** True once the draft is created or given up, so that leaving asks nothing. */
	let settled = false;
	/** Where the reader came from, which Cancel goes back to. */
	let back: string | null = null;

	// The id is the clock's at Save, so the preview resolves files against
	// `tasks/`, where only the files pasted or dropped are found.
	const options = $derived({
		assetUrl: repo.assetUrl,
		taskId: '',
		taskUrl: taskLinks(ref, repo.tasks, '')
	});

	async function save() {
		if (saving) return;
		saving = true;
		const id = await repo.create($state.snapshot(sheet.draft), sheet.extras());
		saving = false;
		if (id === null) return;
		settled = true;
		await goto(taskHref(ref, id));
	}

	function cancel() {
		settled = true;
		goto(back ?? listHref(ref));
	}

	afterNavigate(({ from }) => {
		if (from) back = from.url.pathname + from.url.search;
	});

	askBeforeLeaving(() => sheet.dirty && !settled, 'Leave this new task without saving it?');
</script>

<svelte:head>
	<title>New task · {repo.name}</title>
</svelte:head>

<main class="task-page">
	{#if repo.phase !== 'ready'}
		<div class="wide"><RepoStatus {repo} {ref} /></div>
	{:else if !repo.editable}
		<section class="panel wide">
			<h2>Read-only</h2>
			<p>
				A task is created where the repository can be written: a folder the dev server serves, or
				one opened in a Chromium browser.
			</p>
			<p><a href={listHref(ref)}>Back to the list</a></p>
		</section>
	{:else}
		<EditSheet
			{sheet}
			saveable
			{saving}
			untitled={UNTITLED}
			{options}
			onsave={save}
			oncancel={cancel}
		/>
		<aside>
			<Properties
				known={sheet.known}
				fresh={sheet.fresh}
				bind:fields={sheet.draft}
				bind:described={sheet.described}
				creating
			/>
		</aside>
	{/if}
</main>

<style>
	.panel {
		padding: 1.5rem 1.75rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
	}
</style>
