<script lang="ts">
	// Shows a task's status, priority and creation date, in the row above its title.
	import type { Task } from '#lib/tatr/task.ts';

	interface Props {
		task: Task;
	}

	let { task }: Props = $props();
</script>

<div class="meta">
	<span class="status" class:closed={task.closed}>{task.status}</span>
	<span class="prio">priority {task.priority}</span>
	{#if task.created}
		<span class="muted">·</span>
		<span class="muted">
			created {task.created.toISOString().slice(0, 10)}
			{task.created.toISOString().slice(11, 16)} UTC
		</span>
	{/if}
</div>

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
</style>
