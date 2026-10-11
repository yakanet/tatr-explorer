<script lang="ts">
	import { BINDINGS } from '#lib/keys.ts';

	interface Props {
		/** The views `1` to `9` switch to, in order; none on the landing page. */
		views: string[];
		/** Whether `b` has a branch to choose here, which a folder has not. */
		branch?: boolean;
		onclose: () => void;
	}

	let { views, branch = false, onclose }: Props = $props();

	let panel = $state<HTMLElement | null>(null);

	/** Which optional bindings do something on this page. */
	const offered = $derived({ view: views.length > 0, branch });
	const shown = $derived(BINDINGS.filter(({ needs }) => !needs || offered[needs]));

	// Opened from the keyboard, so it takes the focus to be closed from it.
	$effect(() => {
		panel?.focus();
	});

	/**
	 * Closes the panel on Escape. Other keys propagate, so the shortcut layer
	 * still handles `?`, which the panel lists.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onclose();
	}
</script>

<!-- A backdrop that closes on click; the panel stops its own clicks. Not a
     <dialog>, which would take Escape and the keyboard from the shortcut layer. -->
<div class="backdrop" role="presentation" onclick={onclose}>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard shortcuts"
		tabindex="-1"
		bind:this={panel}
		{onkeydown}
		onclick={(event) => event.stopPropagation()}
	>
		<h2>Keyboard</h2>
		<dl>
			{#each shown as binding (binding.keys)}
				<div class="row">
					<dt><kbd>{binding.keys}</kbd></dt>
					<dd>{binding.does}</dd>
				</div>
			{/each}
		</dl>

		<p class="views">
			{#each views as view, i (view)}
				<span><kbd>{i + 1}</kbd> {view}</span>
			{/each}
		</p>

		<button type="button" class="action" onclick={onclose}>Close</button>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: rgb(18 17 22 / 0.5);
	}

	.panel {
		width: min(31.625rem, 100%);
		padding: 1.5rem 1.75rem 1.25rem;
		box-shadow: var(--shadow-menu);
		outline: none;
	}

	h2 {
		margin: 0 0 1rem;
		font-family: var(--font-display);
		font-size: 1rem;
	}

	dl {
		margin: 0;
		display: grid;
		gap: 0.3rem;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	dt {
		flex-shrink: 0;
		width: 5.5rem;
	}

	dd {
		margin: 0;
		color: var(--ink-2);
	}

	.views {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1rem 0 0;
		padding-top: 0.85rem;
		border-top: 1px solid var(--border);
		color: var(--ink-2);
	}

	.action {
		margin-top: 1rem;
	}
</style>
