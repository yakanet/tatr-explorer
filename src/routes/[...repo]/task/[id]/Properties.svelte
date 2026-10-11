<script lang="ts">
	// Lists every property of a task, each key beside its value.
	import SidePanel from './SidePanel.svelte';

	interface Props {
		properties: Map<string, string>;
	}

	let { properties }: Props = $props();
</script>

<SidePanel title="Properties">
	<dl>
		{#each properties as [key, value] (key)}
			<dt>{key}</dt>
			<dd>
				{#if value}{value}{:else}<span class="muted">empty</span>{/if}
			</dd>
		{/each}
	</dl>
	{#snippet note()}Any property key is shown, not just these.{/snippet}
</SidePanel>

<style>
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
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
		font-family: var(--font-mono);
	}
</style>
