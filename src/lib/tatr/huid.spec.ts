import { describe, expect, it } from 'vitest';
import { formatHuid, isValidHuid, parseHuid, scanHuidSpans, scanHuids } from './huid.ts';

describe('parseHuid', () => {
	it('reads the timestamp as UTC', () => {
		const huid = parseHuid('20260826-200847');
		expect(huid?.created?.toISOString()).toBe('2026-08-26T20:08:47.000Z');
		expect(huid?.suffix).toBeUndefined();
	});

	it('keeps a team suffix', () => {
		const huid = parseHuid('20260830-000838-rexim');
		expect(huid?.suffix).toBe('rexim');
		expect(huid?.created?.toISOString()).toBe('2026-08-30T00:08:38.000Z');
	});

	it('allows dashes and digits inside the suffix', () => {
		expect(parseHuid('20260830-000838-team-01')?.suffix).toBe('team-01');
	});

	it.each([
		'2026083-000838',
		'20260830-00083',
		'20260830',
		'20260830_000838',
		'20260830-000838-bad_suffix',
		'tags',
		''
	])('rejects %o', (id) => {
		expect(parseHuid(id)).toBeNull();
	});

	it('keeps an id whose digits are no real instant, without a date', () => {
		// The CLI never reads them, so these are tasks to it. Date.UTC would roll
		// 31 February over into March, which is why there is no date rather than
		// a wrong one.
		expect(parseHuid('20260231-000000')).toEqual({ id: '20260231-000000', created: null });
		expect(parseHuid('20260830-250000-x')).toEqual({
			id: '20260830-250000-x',
			created: null,
			suffix: 'x'
		});
	});

	it('accepts a leap day', () => {
		expect(parseHuid('20240229-120000')?.created?.toISOString()).toBe('2024-02-29T12:00:00.000Z');
	});
});

describe('isValidHuid', () => {
	it('accepts both forms', () => {
		expect(isValidHuid('20260906-211152')).toBe(true);
		expect(isValidHuid('20260830-000838-rexim')).toBe(true);
	});

	it('rejects the tags file that sits beside the task folders', () => {
		expect(isValidHuid('tags')).toBe(false);
	});

	it('reads the shape only, never the date, as `is_valid_huid` does', () => {
		expect(isValidHuid('20260231-000000')).toBe(true);
	});

	it('accepts an empty suffix and refuses a short time', () => {
		expect(isValidHuid('20260830-000838-')).toBe(true);
		expect(isValidHuid('20260830-00083')).toBe(false);
	});
});

describe('formatHuid', () => {
	it('round-trips', () => {
		const id = '20260906-211152';
		expect(formatHuid(parseHuid(id)!.created!)).toBe(id);
	});

	it('pads every component', () => {
		expect(formatHuid(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('20260102-030405');
	});

	it('appends a suffix', () => {
		expect(formatHuid(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)), 'rexim')).toBe(
			'20260102-030405-rexim'
		);
	});
});

describe('scanHuids', () => {
	it('reads ids out of prose, in order and with repeats', () => {
		expect(scanHuids('see 20260101-000001, then 20260101-000002 and 20260101-000001')).toEqual([
			'20260101-000001',
			'20260101-000002',
			'20260101-000001'
		]);
	});

	it('reads the wrappers the format uses', () => {
		expect(scanHuids('TASK(20260101-000001) and ## NOTE(20260101-000002)')).toEqual([
			'20260101-000001',
			'20260101-000002'
		]);
	});

	it('keeps a team suffix', () => {
		expect(scanHuids('20260101-000001-rexim')).toEqual(['20260101-000001-rexim']);
	});

	it('needs no word boundary, as the C scanner has none', () => {
		expect(scanHuids('abc20260101-000001')).toEqual(['20260101-000001']);
	});

	it('finds nothing in a text without ids', () => {
		expect(scanHuids('2026-01-01 is not one, nor is 20260101')).toEqual([]);
	});

	/**
	 * The scan stops at the end of the text rather than at the end of a
	 * well-formed id, so the last id in a text can be accepted while
	 * incomplete. Harmless — every caller then looks the task up and finds
	 * nothing — but it decides where a scan ends, so it is pinned rather than
	 * left to be discovered by whoever rewrites this.
	 */
	it('accepts a time cut short by the end of the text', () => {
		expect(scanHuids('see 20260101-0000')).toEqual(['20260101-0000']);
		expect(scanHuids('see 20260101-')).toEqual(['20260101-']);
	});

	it('does not accept a date cut short by it', () => {
		// Nothing follows the digits, so the dash that must come next is missing.
		expect(scanHuids('see 2026010')).toEqual([]);
	});

	it('accepts one cut short only at the end, not before a space', () => {
		expect(scanHuids('20260101-0000 and 20260101-000002')).toEqual(['20260101-000002']);
	});

	it('stops a suffix at the first character it cannot hold', () => {
		expect(scanHuids('20260101-000001-rexim_two')).toEqual(['20260101-000001-rexim']);
		expect(scanHuids('20260101-000001-a.b')).toEqual(['20260101-000001-a']);
	});

	it('resumes just past an id, so two glued ids both count', () => {
		expect(scanHuids('20260101-00000120260101-000002')).toEqual([
			'20260101-000001',
			'20260101-000002'
		]);
	});
});

describe('scanHuidSpans', () => {
	it('says where each id sits, so a renderer can cut there', () => {
		expect(scanHuidSpans('depends on 20260907-011003 first')).toEqual([
			{ id: '20260907-011003', start: 11, end: 26 }
		]);
	});

	it('every span slices back to its own id', () => {
		// Which is the reason the positions come out of the scan rather than
		// being looked up afterwards: the same id can appear where the scanner
		// does not read one, and a search would link the wrong occurrence.
		const text = '20260907-01 is not one, 20260907-011003 is, and so is 20260304-115038';
		const spans = scanHuidSpans(text);
		expect(spans).toHaveLength(2);
		for (const span of spans) expect(text.slice(span.start, span.end)).toBe(span.id);
	});
});
