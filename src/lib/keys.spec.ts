import { describe, expect, it } from 'vitest';
import { BINDINGS, NOTHING_PENDING, press, type Pending } from './keys.ts';

/** Feeds a run of keys, threading the pending sequence the way the listener does. */
function type(...keys: string[]) {
	let pending: Pending = NOTHING_PENDING;
	const actions = keys.map((key) => {
		const pressed = press(key, pending);
		pending = pressed.pending;
		return pressed.action;
	});
	return { actions, pending };
}

describe('press', () => {
	it('moves with j and k', () => {
		expect(press('j').action).toEqual({ kind: 'next' });
		expect(press('k').action).toEqual({ kind: 'previous' });
	});

	it('gives the arrows the same meaning as their vi twin', () => {
		expect(press('ArrowDown').action).toEqual(press('j').action);
		expect(press('ArrowUp').action).toEqual(press('k').action);
	});

	it('needs both halves of g g', () => {
		const { actions } = type('g', 'g');
		expect(actions).toEqual([null, { kind: 'first' }]);
	});

	it('holds nothing after a single g', () => {
		expect(press('g').pending).toEqual({ sequence: 'g' });
	});

	it('disarms a sequence a stray key interrupts', () => {
		// Otherwise `g x g` would jump, having quietly kept the first `g` armed.
		const { actions, pending } = type('g', 'x', 'g');
		expect(actions).toEqual([null, null, null]);
		expect(pending).toEqual({ sequence: 'g' });
	});

	it('does not read the second g of an interrupted sequence as a move', () => {
		expect(type('g', 'j').actions).toEqual([null, null]);
	});

	it('switches view by position, counted from zero', () => {
		expect(press('1').action).toEqual({ kind: 'view', index: 0 });
		expect(press('3').action).toEqual({ kind: 'view', index: 2 });
		expect(press('9').action).toEqual({ kind: 'view', index: 8 });
	});

	it('leaves 0 alone, there being no zeroth view', () => {
		expect(press('0').action).toBeNull();
	});

	it('reads the rest of the map', () => {
		expect(press('/').action).toEqual({ kind: 'search' });
		expect(press('?').action).toEqual({ kind: 'help' });
		expect(press('b').action).toEqual({ kind: 'branch' });
		expect(press('Escape').action).toEqual({ kind: 'dismiss' });
		expect(press('G').action).toEqual({ kind: 'last' });
		expect(press('Home').action).toEqual({ kind: 'first' });
		expect(press('End').action).toEqual({ kind: 'last' });
	});

	it('has nothing to say about a key it does not know', () => {
		expect(press('q').action).toBeNull();
		expect(press('F5').action).toBeNull();
	});

	it('tells j from J, so a shifted key is never a move', () => {
		expect(press('J').action).toBeNull();
	});
});

describe('BINDINGS', () => {
	it('documents every key the map answers to', () => {
		const documented = BINDINGS.map((binding) => binding.keys).join(' ');
		for (const key of ['j', 'k', 'g g', 'G', '/', '?', 'b', 'Esc']) {
			expect(documented).toContain(key);
		}
	});
});
