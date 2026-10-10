<script lang="ts">
	import { NOTHING_PENDING, press, type Pending } from '#lib/keys.ts';

	let {
		onview,
		onbranch,
		onhelp,
		ondismiss,
		modal = false
	}: {
		/**
		 * Switch to the view at this position in the nav. Absent where there is
		 * no nav, as on the homepage, and `1`-`9` then do nothing rather than
		 * being wired to something invented for them.
		 */
		onview?: (index: number) => void;
		/** `b`: absent where there is no branch to choose, a folder or the homepage. */
		onbranch?: () => void;
		onhelp: () => void;
		/** Escape, which the layout uses to close whatever it has open. */
		ondismiss: () => void;
		/**
		 * True while something modal is open. Navigation then does nothing: moving
		 * the focus would take it out of a dialog that claims `aria-modal`, and a
		 * row lighting up behind a panel is nobody's intent. Cheaper than trapping
		 * the focus, and this layer is what opened the panel, so it already knows.
		 */
		modal?: boolean;
	} = $props();

	let pending = $state<Pending>(NOTHING_PENDING);

	/**
	 * Whatever the reader can walk with `j`/`k`, in the order it is drawn.
	 *
	 * Read from the document rather than registered by each view: a view says
	 * what is navigable by marking it, and one implementation then serves the
	 * list, the graph and the dashboard alike. Marking a focusable element is
	 * also what keeps Enter working without a line of code: the row *is* a link.
	 */
	const rows = () => [...document.querySelectorAll<HTMLElement>('[data-key-row]')];

	/**
	 * Where the focus sits among them, or -1 when it sits elsewhere.
	 *
	 * Two ways of sitting somewhere, and only one of them is obvious. The focus
	 * may be the mark or inside it (a link inside a marked node), which the
	 * containment test finds. Or it may be a *cousin*: a list row marks its
	 * title link, and the tag buttons beside it live in another cell, so
	 * neither element contains the other. A reader who tabbed to a tag was
	 * nowhere, and `j` restarted from the top instead of moving one row.
	 *
	 * `closest('[data-key-row]')` does not answer that, whatever this task
	 * first claimed: it walks ancestors, and no ancestor of the tag carries the
	 * mark. What does answer it is walking up until an ancestor is found that
	 * *holds* a mark: the first one that does is the row itself.
	 */
	function current(items: HTMLElement[]): number {
		const active = document.activeElement;
		if (!(active instanceof HTMLElement)) return -1;

		const inside = items.findIndex((item) => item === active || item.contains(active));
		if (inside !== -1) return inside;

		for (let node = active.parentElement; node; node = node.parentElement) {
			const marks = node.querySelectorAll<HTMLElement>('[data-key-row]');
			if (marks.length === 0) continue;
			// One mark is a row. More than one means the walk has climbed out of
			// the row into something holding all of them, and the focus is beside
			// the list rather than in it, where `j` should land on the first row
			// rather than move on from it.
			return marks.length === 1 ? items.indexOf(marks[0]) : -1;
		}
		return -1;
	}

	/**
	 * Moves the focus and says so, with an attribute the views style.
	 *
	 * `:focus-visible` cannot carry this: the browser decides when to match it,
	 * and a focus moved by script only qualifies if the browser judges the
	 * current interaction to be a keyboard one, which it does not reliably do
	 * for a focus *we* moved. Since `j`/`k` are useless without a visible focus,
	 * the mark has to be ours rather than the browser's guess.
	 */
	function focus(item: HTMLElement | undefined) {
		if (!item) return;

		for (const marked of document.querySelectorAll('[data-key-focus]')) {
			marked.removeAttribute('data-key-focus');
		}
		item.setAttribute('data-key-focus', '');
		item.focus();
		// `nearest` scrolls only when it has to, so walking a visible list does
		// not yank the page about.
		item.scrollIntoView({ block: 'nearest' });
	}

	/** The mark belongs to the focus, so it leaves with it. */
	function onfocusout(event: FocusEvent) {
		if (event.target instanceof HTMLElement) event.target.removeAttribute('data-key-focus');
	}

	function move(step: number) {
		const items = rows();
		if (items.length === 0) return;

		const at = current(items);
		// Coming from outside the list, `j` should land on the first row rather
		// than the second, and `k` on the last.
		if (at === -1) {
			focus(step > 0 ? items[0] : items[items.length - 1]);
			return;
		}
		focus(items[Math.min(items.length - 1, Math.max(0, at + step))]);
	}

	function jump(to: 'first' | 'last') {
		const items = rows();
		focus(to === 'first' ? items[0] : items[items.length - 1]);
	}

	/**
	 * Whether a keystroke belongs to whatever the reader is typing into.
	 *
	 * Without this, `j` in the query box would walk the list instead of spelling
	 * a word. Escape is the exception: leaving a field is exactly what it is for.
	 */
	function isTyping(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
	}

	function onkeydown(event: KeyboardEvent) {
		// A modified key belongs to the browser or the operating system.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (isTyping(event.target)) {
			if (event.key !== 'Escape') return;
			// The query box handles Escape itself while its menu is open, and says
			// so by consuming the event.
			if (event.defaultPrevented) return;
			(event.target as HTMLElement).blur();
			ondismiss();
			return;
		}

		const pressed = press(event.key, pending);
		pending = pressed.pending;
		if (!pressed.action) return;

		const action = pressed.action;
		// The panel owns Escape while it is up, and `?` still toggles it. Nothing
		// else reaches the page behind.
		if (modal && action.kind !== 'help' && action.kind !== 'dismiss') return;
		if (action.kind === 'search') {
			const box = document.querySelector<HTMLElement>('[data-key-search]');
			if (!box) return;
			event.preventDefault();
			box.focus();
			return;
		}

		event.preventDefault();
		switch (action.kind) {
			case 'next':
				move(1);
				break;
			case 'previous':
				move(-1);
				break;
			case 'first':
				jump('first');
				break;
			case 'last':
				jump('last');
				break;
			case 'help':
				onhelp();
				break;
			case 'dismiss':
				ondismiss();
				break;
			case 'view':
				onview?.(action.index);
				break;
			case 'branch':
				onbranch?.();
				break;
		}
	}
</script>

<svelte:window {onkeydown} {onfocusout} />
