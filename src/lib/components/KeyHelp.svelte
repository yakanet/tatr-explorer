<script lang="ts">
	import { BINDINGS } from '#lib/keys.ts';

	let {
		views,
		branch = false,
		onclose
	}: {
		views: string[];
		/** Whether `b` has a branch to choose here, which a folder has not. */
		branch?: boolean;
		onclose: () => void;
	} = $props();

	let panel = $state<HTMLElement | null>(null);

	/**
	 * A page advertises only the keys that do something on it. The homepage has
	 * no views to switch between and no branch to choose, so neither `1`-`9` nor
	 * `b` is listed there.
	 */
	const offered = $derived({ view: views.length > 0, branch });
	const shown = $derived(BINDINGS.filter(({ needs }) => !needs || offered[needs]));

	// Opened from the keyboard, so it has to be closable from the keyboard.
	$effect(() => {
		panel?.focus();
	});

	/**
	 * Escape is handled here rather than left to the shortcut layer.
	 *
	 * The panel takes the focus when it opens, so a key pressed in it starts
	 * from inside — and the panel used to stop every key from propagating, which
	 * swallowed the one shortcut it advertises in its own list. Owning Escape is
	 * both shorter and the reason nothing has to be stopped now.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onclose();
	}
</script>

<!-- A backdrop that closes on click, with the panel stopping the click that
     lands on it. Not a <dialog>: it would take Escape and the modal keyboard
     with it, and the shortcut layer has to keep both. -->
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
		width: min(28rem, 100%);
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
