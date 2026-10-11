<script lang="ts">
	import { tick } from 'svelte';
	import { formatDiagnostic } from '#lib/tql/query.ts';
	import { apply, complete, type TagOption } from '#lib/tql/complete.ts';
	import { lsEcho, STATUSES } from '#lib/tql/command.ts';
	import type { QueryState } from '#lib/state/query.svelte.ts';

	interface Props {
		query: QueryState;
		/** How many tasks the query keeps. */
		matched: number;
		/** How many tasks the query runs over. */
		pool: number;
		/** The repository's tags, so the box can offer them by name. */
		tags: TagOption[];
		onchange?: () => void;
		/**
		 * False where the status means nothing, as on the board, whose closed
		 * tasks have a column of their own.
		 */
		chooseStatus?: boolean;
	}

	let { query, matched, pool, tags, onchange, chooseStatus = true }: Props = $props();

	let field = $state<HTMLInputElement | null>(null);
	let caret = $state(0);
	let dismissed = $state(false);
	let active = $state(0);

	const found = $derived.by(() => {
		if (dismissed) return null;
		return complete(query.text, caret, tags);
	});

	/**
	 * The `tatr ls` command that lists what is shown, or why none can. None on
	 * the board, whose columns no command produces, nor over a query in error,
	 * whose diagnostic matters more.
	 */
	const echo = $derived.by(() => {
		if (!chooseStatus || query.error) return null;
		return lsEcho(query.source, query.node, query.status);
	});

	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			// Restarted on every click, so a second click shows the word its full time.
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 1500);
		} catch {
			// An insecure context or a denied permission refuses the copy; the
			// command stays on screen to select by hand.
		}
	}

	// The menu is rebuilt on every keystroke, so the highlight is clamped to the
	// items that remain.
	const selected = $derived.by(() => {
		if (!found) return 0;
		return Math.min(active, found.items.length - 1);
	});

	/** The id of the highlighted completion, which a screen reader announces. */
	function activeDescendant() {
		if (!found) return undefined;
		return `completion-${selected}`;
	}

	/** Records the caret, which an arrow key or a click moves without changing the text. */
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
			// Consumed only when a menu is open, so the first Escape closes the menu
			// and the second, reaching the shortcut layer, leaves the field.
			if (found) event.preventDefault();
			dismissed = true;
			return;
		}

		// An arrow reopens a menu that Escape closed, since Escape only moved it
		// out of the way.
		if (!found && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			dismissed = false;
			return;
		}
		if (!found) return;

		const count = found.items.length;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = (selected + 1) % count;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = (selected + count - 1) % count;
		} else if (event.key === 'Home') {
			event.preventDefault();
			active = 0;
		} else if (event.key === 'End') {
			event.preventDefault();
			active = count - 1;
		} else if (event.key === 'Tab' || event.key === 'Enter') {
			// Otherwise Enter would submit nothing and Tab would leave the field,
			// both closing the menu.
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
				aria-activedescendant={activeDescendant()}
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
								<!-- Pointer down rather than click: otherwise the field blurs
								     first and closes the menu before the click lands. -->
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

					<!-- The whole grammar fits here, so the reader need not guess that
					     comparisons are words and groups are brackets. -->
					<p class="grammar mono">
						~word &nbsp; priority lt 50 &nbsp; not tagged &nbsp; [ a or b ]
					</p>
					<!-- Listed, because readers reach for the mouse when a menu does not
					     say it answers the keyboard. -->
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
			<!-- `tatr ls`, `tatr ls -c`, and both. Radios, so the arrow keys move the
			     choice and a screen reader announces one choice of three. -->
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
		<!-- Only the message takes the danger colour, as the one line that says
		     what to change. -->
		{@const report = formatDiagnostic(query.source, query.error)}
		{@const cut = report.lastIndexOf('\n') + 1}
		<pre class="diagnostic">{report.slice(0, cut)}<span class="message">{report.slice(cut)}</span
			></pre>
	{:else}
		{#if echo?.kind === 'command'}
			<!-- The prompt is not part of the command, so it stays out of a
			     selection and out of the copy. -->
			<p class="echo">
				<span class="shell" aria-hidden="true">$</span>
				<code>{echo.text}</code>
				<button type="button" class="action copy" onclick={() => copy(echo.text)}>
					{#if copied}Copied{:else}Copy{/if}
				</button>
			</p>
		{:else if echo?.kind === 'ours'}
			<!-- Shown here, before the reader carries the query to a terminal where
			     it would fail. -->
			<p class="echo">
				<span>
					{#if echo.titles.length > 0}
						Searching titles ({#each echo.titles as term, index (index)}{#if index > 0}{', '}{/if}<code
								>{term}</code
							>{/each}) is this viewer's own: no <code>tatr ls</code> can.
					{/if}
					{#if echo.both}
						<code>all</code> is this viewer's own: <code>tatr ls</code> lists the open tasks,
						<code>tatr ls -c</code> the closed ones.
					{/if}
				</span>
			</p>
		{/if}
		{#if query.warnings.length > 0}
			<p class="warning">{query.warnings[0].message}</p>
		{/if}
	{/if}
</div>

<style>
	/* The query controls the view, not the site, so it sits in the view's
	   column, as wide as what it filters. */
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
		min-height: 3.625rem;
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
		min-height: 2.375rem;
	}

	.menu {
		min-width: 24.925rem;
		/* 90vw for the rows, plus the menu's padding and border. */
		max-width: min(34.925rem, 90vw + 0.8rem + 2px);
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

	/* A keyword is grammar, not data, so it takes no accent. */
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

	/* Pulled into the bar's padding, so the two curves stay concentric. */
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

	/* Quieter than the bar: a footnote to the query, not a second control. */
	.echo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.6rem;
		margin: 0;
		padding: 0 1.1rem;
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.echo code {
		font-family: var(--font-mono);
		color: var(--ink-2);
	}

	.shell {
		font-family: var(--font-mono);
		user-select: none;
	}

	/* The site's quiet button, sized down for a line of small text. */
	.copy {
		min-height: auto;
		padding: 0.1rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--ink-2);
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
