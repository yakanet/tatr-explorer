import { describe, expect, it } from 'vitest';
import { tagHue } from './tag-hue.ts';

describe('tagHue', () => {
	it('gives the tags of tsoding/tatr the hues the design system shows', () => {
		expect(tagHue('wontfix')).toBe(1);
		expect(tagHue('bug')).toBe(2);
		expect(tagHue('stream')).toBe(2);
		expect(tagHue('tql')).toBe(3);
		expect(tagHue('release')).toBe(3);
		expect(tagHue('scope')).toBe(4);
	});

	it('depends on the name only, so it is stable', () => {
		expect(tagHue('scope')).toBe(tagHue('scope'));
		expect([...'abcdefghijklmnop'].map(tagHue).every((hue) => hue >= 1 && hue <= 4)).toBe(true);
	});
});
