/**
 * The keyboard map, kept apart from its listener so that what a keystroke
 * means can be tested without a DOM.
 *
 * The bindings come from tools a reader already knows: `j`/`k` and `g g` from
 * vi, `/` and `?` from less, `1`-`9` from tabbed apps, `b` for branch. Arrows do what
 * their vi twin does.
 */

export type Action =
	/** Move the focus one navigable item along. */
	| { kind: 'next' }
	| { kind: 'previous' }
	/** Jump to the ends of the same list. */
	| { kind: 'first' }
	| { kind: 'last' }
	/** Put the caret in the query box. */
	| { kind: 'search' }
	| { kind: 'help' }
	/** Escape: close whatever is open, or give up the focus. */
	| { kind: 'dismiss' }
	/** Switch view by position in the nav, counted from zero. */
	| { kind: 'view'; index: number }
	/** Open the header's field for reading another branch. */
	| { kind: 'branch' };

/** The sequence typed so far: a single slot, since `g g` is the only sequence. */
export interface Pending {
	sequence: 'g' | null;
}

export const NOTHING_PENDING: Pending = { sequence: null };

export interface Pressed {
	action: Action | null;
	pending: Pending;
}

const SIMPLE: Record<string, Action> = {
	j: { kind: 'next' },
	ArrowDown: { kind: 'next' },
	k: { kind: 'previous' },
	ArrowUp: { kind: 'previous' },
	G: { kind: 'last' },
	Home: { kind: 'first' },
	End: { kind: 'last' },
	'/': { kind: 'search' },
	'?': { kind: 'help' },
	b: { kind: 'branch' },
	Escape: { kind: 'dismiss' }
};

/**
 * Reads one keystroke. Any key but `g` clears a pending `g`, so a stray key
 * cannot leave it armed and turn the next `g` into an unwanted jump.
 */
export function press(key: string, pending: Pending = NOTHING_PENDING): Pressed {
	if (pending.sequence === 'g') {
		if (key === 'g') return { action: { kind: 'first' }, pending: NOTHING_PENDING };
		return { action: null, pending: NOTHING_PENDING };
	}

	if (key === 'g') return { action: null, pending: { sequence: 'g' } };

	const simple = SIMPLE[key];
	if (simple) return { action: simple, pending: NOTHING_PENDING };

	if (/^[1-9]$/.test(key)) {
		return { action: { kind: 'view', index: Number(key) - 1 }, pending: NOTHING_PENDING };
	}

	return { action: null, pending: NOTHING_PENDING };
}

interface Binding {
	keys: string;
	does: string;
	/**
	 * The action this binding needs, which only some pages offer. The help panel
	 * hides the binding elsewhere rather than list a key that does nothing there.
	 */
	needs?: Extract<Action['kind'], 'view' | 'branch'>;
}

/** Every binding, for the help panel, in reading order rather than the order of `SIMPLE`. */
export const BINDINGS: readonly Binding[] = [
	{ keys: 'j / k', does: 'move down and up' },
	{ keys: '↓ / ↑', does: 'the same' },
	{ keys: 'g g', does: 'jump to the first' },
	{ keys: 'G', does: 'jump to the last' },
	{ keys: 'Enter', does: 'open what is focused' },
	{ keys: '/', does: 'search' },
	{ keys: '1 … 9', does: 'switch view', needs: 'view' },
	{ keys: 'b', does: 'read another branch', needs: 'branch' },
	{ keys: '?', does: 'this list' },
	{ keys: 'Esc', does: 'close, or leave the box' }
];
