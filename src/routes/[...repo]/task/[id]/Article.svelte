<script lang="ts">
	// Shows a task's status, priority, creation date and title, then its
	// description and the entries appended to it.
	import { renderInline, type RenderOptions } from '#lib/render/markdown.ts';
	import type { Task } from '#lib/tatr/task.ts';
	import Journal from './Journal.svelte';

	interface Props {
		task: Task;
		/** The description, or null until it is read. */
		body: string | null;
		loadingBody: boolean;
		/** How this task's title and description render. */
		options: RenderOptions;
		/** Opens the editing sheet, or is absent where the task cannot be edited. */
		onedit?: () => void;
	}

	let { task, body, loadingBody, options, onedit }: Props = $props();

	/** Formats an instant to the minute, as `2026-10-11 17:28`, in UTC like the ids. */
	function formatMinute(date: Date): string {
		return date.toISOString().slice(0, 16).replace('T', ' ');
	}
</script>

<article class="panel">
	<div class="meta">
		<span class="status" class:closed={task.closed}>{task.status}</span>
		<span class="prio">priority {task.priority}</span>
		{#if task.created}
			<span class="muted">·</span>
			<span class="muted">
				created {formatMinute(task.created)} UTC
			</span>
		{/if}
		{#if onedit}
			<button type="button" class="action edit" onclick={onedit}>Edit</button>
		{/if}
	</div>

	<h1>{@html renderInline(task.title, options)}</h1>

	{#if task.malformed}
		<p class="warning">
			This file does not start with <code>#</code>, so the reference parser abandons its properties
			entirely. It is shown as it was read.
		</p>
	{/if}

	{#if loadingBody}
		<p class="muted">Reading the body…</p>
	{:else}
		<Journal body={body ?? ''} {options} />
	{/if}
</article>

<style>
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.6rem;
		font-size: 0.8125rem;
		margin-bottom: 0.875rem;
	}

	/* The status pill takes the accent while open and grey once closed, so the
	   tint agrees with the word. */
	.status {
		display: inline-flex;
		align-items: center;
		height: 1.625rem;
		padding: 0 0.75rem;
		font-weight: 700;
		color: var(--accent-text);
		background: var(--accent-wash);
		border-radius: var(--radius-full);
	}

	.status.closed {
		color: var(--ink-2);
		background: var(--tint);
	}

	/* Edit sits at the end of the line, away from what describes the task. */
	.edit {
		margin-left: auto;
	}

	.panel {
		padding: 1.5rem 1.75rem;
	}

	h1 {
		margin: 0 0 1.5rem;
		font-size: 1.375rem;
		line-height: 1.35;
		font-weight: 700;
		letter-spacing: -0.01em;
		text-wrap: pretty;
	}

	.warning {
		font-size: 0.8125rem;
		color: var(--warning);
	}
</style>
