<script lang="ts">
	// Lists every property of a task, each key beside its value. Where the source
	// writes, the status, the priority and the tags are edited in place.
	import { tagHue } from '#lib/render/tag-hue.ts';
	import {
		chain,
		withDefaults,
		withoutTag,
		withPriority,
		withStatus,
		withTag,
		type Edit
	} from '#lib/tatr/task-file.ts';
	import { parseTags } from '#lib/tatr/task-md.ts';
	import type { Task } from '#lib/tatr/task.ts';
	import SidePanel from './SidePanel.svelte';

	interface Props {
		task: Task;
		/**
		 * Rewrites the task's file with an edit, saying what it did; absent where
		 * the task cannot be edited, which leaves every property read-only.
		 */
		onedit?: (edit: Edit, what: string) => Promise<void>;
	}

	let { task, onedit }: Props = $props();

	const editing = $derived(onedit !== undefined);

	/**
	 * The rows shown. While editing they are the file as a rewrite will hold it,
	 * the defaults the CLI assumes included, so that every control has its row.
	 */
	const rows = $derived.by(() => {
		if (editing) return withDefaults(task.properties);
		return task.properties;
	});

	/** The statuses offered: open, closed, and the task's own when it is neither. */
	const statuses = $derived([...new Set(['OPEN', 'CLOSED', task.status])]);
	/** Each tag once, as removing one removes every occurrence. */
	const tags = $derived([...new Set(task.tags)]);

	/**
	 * Applies an edit, then puts the control back to the task's value, which a
	 * write that failed did not change.
	 */
	async function apply(edit: Edit, what: string, reset: () => void) {
		await onedit?.(edit, what);
		reset();
	}

	function statusChosen(event: Event & { currentTarget: HTMLSelectElement }) {
		const select = event.currentTarget;
		const status = select.value;
		apply(withStatus(status), `status set to ${status}`, () => (select.value = task.status));
	}

	function priorityChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const reset = () => (input.value = String(task.priority));
		const priority = input.valueAsNumber;
		if (!Number.isInteger(priority)) return reset();
		apply(withPriority(priority), `priority set to ${priority}`, reset);
	}

	function tagTyped(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (event.key !== 'Enter') return;
		const input = event.currentTarget;
		// A tag the file already carries is left to `withTag`, which reads the file on disk.
		const typed = parseTags(input.value);
		if (typed.length === 0) return;
		const what = `tagged ${typed.map((tag) => `:${tag}`).join(' ')}`;
		apply(chain(...typed.map(withTag)), what, () => (input.value = ''));
	}

	function untag(tag: string) {
		onedit?.(withoutTag(tag), `untagged :${tag}`);
	}
</script>

<SidePanel title="Properties">
	<dl>
		{#each rows as [key, value] (key)}
			<dt>{key}</dt>
			<dd>
				{#if editing && key === 'STATUS'}
					<select aria-label="Status" value={task.status} onchange={statusChosen}>
						{#each statuses as status (status)}
							<option value={status}>{status}</option>
						{/each}
					</select>
				{:else if editing && key === 'PRIORITY'}
					<input
						type="number"
						step="1"
						aria-label="Priority"
						value={task.priority}
						onchange={priorityChosen}
					/>
				{:else if editing && key === 'TAGS'}
					<span class="tags">
						{#each tags as tag (tag)}
							<span class="tag" data-hue={tagHue(tag)}>
								{tag}
								<button type="button" aria-label="Remove {tag}" onclick={() => untag(tag)}>×</button
								>
							</span>
						{/each}
						<input aria-label="Add a tag" placeholder="add a tag" onkeydown={tagTyped} />
					</span>
				{:else if value}
					{value}
				{:else}
					<span class="muted">empty</span>
				{/if}
			</dd>
		{/each}
	</dl>
	{#snippet note()}
		{#if editing}
			A change rewrites <code>TASK.md</code> as the CLI would, every property in its place.
		{:else}
			Any property key is shown, not just these.
		{/if}
	{/snippet}
</SidePanel>

<style>
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		gap: 0.45rem 1rem;
		margin: 0 0 0.75rem;
		font-size: 0.8125rem;
	}

	dt {
		font-family: var(--font-mono);
		color: var(--muted);
	}

	dd {
		margin: 0;
		min-width: 0;
		font-family: var(--font-mono);
	}

	select,
	input {
		max-width: 100%;
		padding: 0.2rem 0.5rem;
		font: inherit;
		color: var(--fg);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	input[type='number'] {
		width: 7rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	.tags input {
		width: 8rem;
	}

	/* The remove button sits inside the pill, as small as its text. */
	.tag button {
		padding: 0 0 0 0.15rem;
		font: inherit;
		color: var(--muted);
		background: none;
		border: none;
		cursor: pointer;
	}

	.tag button:hover {
		color: var(--fg);
	}
</style>
