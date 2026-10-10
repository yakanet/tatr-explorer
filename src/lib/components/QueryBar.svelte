<script lang="ts">
	import { tick } from 'svelte';
	import { formatDiagnostic } from '#lib/tql/query.ts';
	import { apply, complete, type TagOption } from '#lib/tql/complete.ts';
	import { STATUSES, type QueryState } from '#lib/state/query.svelte.ts';

	let {
		query,
		matched,
		pool,
		tags,
		onchange,
		chooseStatus = true
	}: {
		query: QueryState;
		matched: number;
		pool: number;
		/** The repository's tags, so the box can offer them by name. */
		tags: TagOption[];
		onchange?: () => void;
		/**
		 * False where choosing open or closed means nothing. On the board the
		 * closed tasks are a column of their own, and a switch that emptied it
		 * would be answering a question the columns already answer.
		 */
		chooseStatus?: boolean;
	} = $props();

	let field = $state<HTMLInputElement | null>(null);
	let caret = $state(0);
	let dismissed = $state(false);
	let active = $state(0);

	const found = $derived(dismissed ? null : complete(query.text, caret, tags));

	// The menu is rebuilt on every keystroke, so the highlight has to be clamped
	// rather than remembered: what was third a moment ago may not exist now.
	const selected = $derived(found ? Math.min(active, found.items.length - 1) : 0);

	/** The caret can move without the text changing — an arrow key, a click. */
	function track() {
		caret = field?.selectionStart ?? query.text.length;
	}

	function typed() {
		dismissed = false;
		active = 0;
		track();
		onchange?.();
	}

	async function accept(value: string) {
		if (!found) return;

		const next = apply(query.text, found, value);
		query.text = next.text;
		dismissed = false;
		active = 0;
		onchange?.();

		// The field's value is bound, so the caret can only be placed once Svelte
		// has written the new text into it.
		await tick();
		field?.setSelectionRange(next.cursor, next.cursor);
		caret = next.cursor;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			// Consumed only when there is a menu to close, so a second Escape
			// falls through to the shortcut layer and gives up the field. One
			// keystroke doing both would leave the reader unable to close the menu
			// without also leaving the box.
			if (found) event.preventDefault();
			dismissed = true;
			return;
		}

		// An arrow reopens a menu Escape closed. Dismissing it is about getting it
		// out of the way, not about refusing it until the next keystroke.
		if (!found && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			dismissed = false;
			return;
		}
		if (!found) return;

		const last = found.items.length - 1;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = selected === last ? 0 : selected + 1;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = selected === 0 ? last : selected - 1;
		} else if (event.key === 'Home') {
			event.preventDefault();
			active = 0;
		} else if (event.key === 'End') {
			event.preventDefault();
			active = last;
		} else if (event.key === 'Tab' || event.key === 'Enter') {
			// Enter would otherwise submit nothing and Tab would leave the field,
			// both of which lose a menu the reader is looking at.
			event.preventDefault();
			accept(found.items[selected].value);
		}
	}
</script>

<div class="query">
	<div class="bar input-pill" class:invalid={query.error !== null}>
		<span class="prompt">&gt;</span>
		<div class="field">
			<input
				bind:this={field}
				bind:value={query.text}
				oninput={typed}
				onclick={track}
				onkeyup={track}
				{onkeydown}
				onblur={() => (dismissed = true)}
				placeholder="any"
				spellcheck="false"
				autocapitalize="off"
				autocorrect="off"
				autocomplete="off"
				aria-label="Query"
				data-key-search
				role="combobox"
				aria-expanded={found !== null}
				aria-controls="query-completions"
				aria-activedescendant={found ? `completion-${selected}` : undefined}
			/>

			{#if found}
				<div class="menu">
					<ul id="query-completions" role="listbox" aria-label="Completions">
						{#each found.items as item, i (item.value)}
							<li
								id="completion-{i}"
								role="option"
								aria-selected={i === selected}
								class:active={i === selected}
							>
								<!-- Pointer down rather than click: the field blurs first
								     otherwise, which closes the menu before the click lands. -->
								<button type="button" onpointerdown={() => accept(item.value)}>
									<span class="value mono" class:keyword={item.kind === 'keyword'}
										>{item.value}</span
									>
									<span class="detail">{item.detail}</span>
									{#if item.count !== undefined}<span class="tally mono">{item.count}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>

					<!-- The grammar is small enough to print in full, which saves the
					     reader guessing that comparisons are words and groups are
					     brackets. -->
					<p class="grammar mono">
						~word &nbsp; priority lt 50 &nbsp; not tagged &nbsp; [ a or b ]
					</p>
					<!-- Said out loud, because a menu that answers the keyboard and never
					     says so is a menu people reach for with the mouse. -->
					<p class="keys">
						<kbd>↑</kbd><kbd>↓</kbd> choose <kbd>⏎</kbd> insert <kbd>esc</kbd> close
					</p>
					{#if found.items.some((item) => item.kind === 'tag' && item.detail)}
						<p class="source">Tag descriptions come from <code>tasks/tags</code></p>
					{/if}
				</div>
			{/if}
		</div>
		<span class="count"
			><strong>{matched}</strong> matched <span class="of">/ {pool} shown</span></span
		>
		{#if chooseStatus}
			<!-- `tatr ls`, `tatr ls -c`, and both at once. Radios, so the arrow keys
			     move the choice and a screen reader hears one choice of three. -->
			<div class="segmented status" role="radiogroup" aria-label="Which tasks">
				{#each STATUSES as status (status)}
					<label>
						<input type="radio" name="status" value={status} bind:group={query.status} {onchange} />
						{status}
					</label>
				{/each}
			</div>
		{/if}
	</div>

	{#if query.error}
		<!-- The help and the source line read in grey, the message alone in the
		     danger colour: it is the one line that says what to change. -->
		{@const report = formatDiagnostic(query.source, query.error)}
		{@const cut = report.lastIndexOf('\n') + 1}
		<pre class="diagnostic">{report.slice(0, cut)}<span class="message">{report.slice(cut)}</span
			></pre>
	{:else if query.warnings.length > 0}
		<p class="warning">{query.warnings[0].message}</p>
	{/if}
</div>

<style>
	/* The query is a control of the view rather than of the site, so it sits in
	   the view's column: as wide as what it filters, and nearer to it than to
	   the header, which spans the page. Two bars of one width, one under the
	   other, read as the same thing said twice. */
	.query {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		min-height: 3rem;
		padding: 0.25rem 1.1rem;
	}

	.prompt {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--accent-text);
	}

	/* Anchors the menu to the text rather than to the whole bar. */
	.field {
		position: relative;
		flex: 1 1 12rem;
		display: flex;
	}

	.field input:not([type]) {
		flex-grow: 1;
		min-height: 2.25rem;
	}

	.menu {
		min-width: 24rem;
		max-width: min(34rem, 90vw);
	}

	li.active button {
		background: var(--accent-wash);
	}

	.value {
		flex-shrink: 0;
		min-width: 6.5rem;
		font-weight: 700;
		color: var(--accent-text);
	}

	/* A keyword is grammar, not data, so it does not wear the accent. */
	.value.keyword {
		color: var(--fg);
	}

	.detail {
		flex-grow: 1;
		color: var(--ink-2);
	}

	.tally {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.grammar,
	.keys,
	.source {
		margin: 0;
		padding: 0.35rem 0.75rem 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.grammar {
		margin-top: 0.35rem;
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
		color: var(--ink-2);
	}

	.keys {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.source {
		padding-bottom: 0.35rem;
	}

	.source code {
		font-size: 0.75rem;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--ink-2);
	}

	.of {
		color: var(--muted);
	}

	/* The status, a segmented control sized to sit inside the bar and pulled into
	   its padding so the two curves stay concentric. */
	.status {
		margin-right: -0.6rem;
		padding: 0.1875rem;
	}

	.status label {
		min-height: 2rem;
		padding: 0 0.85rem;
		font-size: 0.8125rem;
	}

	.diagnostic,
	.warning {
		margin: 0;
		padding: 0.85rem 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}

	.diagnostic {
		color: var(--ink-2);
		white-space: pre;
		overflow-x: auto;
	}

	.message {
		color: var(--danger);
		font-weight: 700;
	}

	.warning {
		color: var(--warning);
	}
</style>
