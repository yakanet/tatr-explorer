<script lang="ts">
	// Lists every property of a task, each key beside its value. While the task
	// is edited or created, the status, the priority and the tags are fields of
	// the draft.
	import { tagHue } from '#lib/render/tag-hue.ts';
	import type { TaskFields } from '#lib/tatr/task-fields.ts';
	import { tagged, untagged, withDefaults } from '#lib/tatr/task-file.ts';
	import { parseTags, readStatus } from '#lib/tatr/task-md.ts';
	import type { TagOption } from '#lib/tql/complete.ts';
	import SidePanel from './SidePanel.svelte';

	interface Props {
		/** The task's properties as read, in their order; none for a new task. */
		properties?: ReadonlyMap<string, string>;
		/** The draft of the editing sheet, or absent while the task is read. */
		fields?: TaskFields;
		/** The repository's tags, which the tags field offers as it is typed. */
		known?: TagOption[];
		/** Whether Save creates the file, for a new task, rather than rewriting it. */
		creating?: boolean;
	}

	let {
		properties = new Map(),
		fields = $bindable(),
		known = [],
		creating = false
	}: Props = $props();

	const id = $props.id();

	/**
	 * The rows shown. While editing they are the file as a save will hold it,
	 * the defaults the CLI assumes included, so that every field has its row.
	 */
	const rows = $derived.by(() => {
		if (fields) return withDefaults(properties);
		return properties;
	});

	/** The statuses offered: open, closed, and the task's own when it is neither. */
	const statuses = $derived([...new Set(['OPEN', 'CLOSED', readStatus(properties)])]);

	function priorityChosen(event: Event & { currentTarget: HTMLInputElement }) {
		if (!fields) return;
		const input = event.currentTarget;
		const priority = input.valueAsNumber;
		if (Number.isInteger(priority)) fields.priority = priority;
		else input.value = String(fields.priority);
	}

	function tagTyped(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (!fields || event.key !== 'Enter') return;
		const input = event.currentTarget;
		fields.tags = parseTags(input.value).reduce(tagged, fields.tags);
		input.value = '';
	}

	function untag(tag: string) {
		if (fields) fields.tags = untagged(fields.tags, tag);
	}
</script>

<SidePanel title="Properties">
	<dl>
		{#each rows as [key, value] (key)}
			<dt>{key}</dt>
			<dd>
				{#if fields && key === 'STATUS'}
					<select aria-label="Status" bind:value={fields.status}>
						{#each statuses as status (status)}
							<option value={status}>{status}</option>
						{/each}
					</select>
				{:else if fields && key === 'PRIORITY'}
					<input
						type="number"
						step="1"
						aria-label="Priority"
						value={fields.priority}
						onchange={priorityChosen}
					/>
				{:else if fields && key === 'TAGS'}
					<span class="tags">
						<!-- Each tag once, as removing one removes every occurrence. -->
						{#each new Set(fields.tags) as tag (tag)}
							<span class="tag" data-hue={tagHue(tag)}>
								{tag}
								<button type="button" aria-label="Remove {tag}" onclick={() => untag(tag)}>×</button
								>
							</span>
						{/each}
						<input
							aria-label="Add a tag"
							placeholder="add a tag"
							list="{id}-tags"
							onkeydown={tagTyped}
						/>
						<datalist id="{id}-tags">
							{#each known.filter((one) => !fields.tags.includes(one.name)) as tag (tag.name)}
								<option value={tag.name}>{tag.description}</option>
							{/each}
						</datalist>
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
		{#if creating}
			Saving creates <code>TASK.md</code> as <code>tatr new</code> would.
		{:else if fields}
			Saving rewrites <code>TASK.md</code> as the CLI would, every property in its place.
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
