import { describe, expect, it } from 'vitest';
import {
	attachmentName,
	collectAttachments,
	formatSize,
	type Listed,
	wantedImageName
} from './attachments.ts';

/** The shape of tsoding/tatr's own task folders, as its listing reports them. */
const UPSTREAM: Listed[] = [
	{ path: 'tasks/tags', size: 220 },
	{ path: 'tasks/20260321-181305/TASK.md', size: 1200 },
	{ path: 'tasks/20260321-181305/nob.h', size: 98_000 },
	{ path: 'tasks/20260321-181305/2026-05-11-074919_1423x794_scrot.png', size: 143_000 },
	{ path: 'tasks/20260321-181305/.gitignore', size: 12 },
	{ path: 'tasks/20260321-181305/path.c', size: 4300 },
	{ path: 'tasks/20260823-172022/2026-08-24-002046_1610x338_scrot.png', size: 41_000 },
	{ path: 'tasks/20260826-200345/TASK.md', size: 300 }
];

const names = (found: Map<string, { name: string }[]>, id: string) =>
	(found.get(id) ?? []).map((one) => one.name);

describe('collectAttachments', () => {
	const found = collectAttachments(UPSTREAM);

	it('groups the files of a task under its id', () => {
		expect(names(found, '20260321-181305')).toEqual([
			'2026-05-11-074919_1423x794_scrot.png',
			'nob.h',
			'path.c'
		]);
	});

	it('leaves out TASK.md, which is the task rather than a file it carries', () => {
		expect(names(found, '20260826-200345')).toEqual([]);
		expect(found.has('20260826-200345')).toBe(false);
	});

	it('leaves out dotfiles', () => {
		expect(names(found, '20260321-181305')).not.toContain('.gitignore');
	});

	it('leaves out a hidden folder at any depth', () => {
		const found = collectAttachments([{ path: 'tasks/20260101-000001/.git/config' }]);
		expect(found.size).toBe(0);
	});

	it('ignores anything outside a task folder', () => {
		// `tasks/tags` belongs to the repository, not to a task.
		expect([...found.keys()]).toEqual(['20260321-181305', '20260823-172022']);
	});

	it('keeps the shape of a nested file', () => {
		const found = collectAttachments([{ path: 'tasks/20260101-000001/shots/before.png' }]);
		expect(names(found, '20260101-000001')).toEqual(['shots/before.png']);
	});

	it('carries the path a raw URL needs, and the size', () => {
		expect(found.get('20260823-172022')).toEqual([
			{
				name: '2026-08-24-002046_1610x338_scrot.png',
				path: 'tasks/20260823-172022/2026-08-24-002046_1610x338_scrot.png',
				size: 41_000
			}
		]);
	});

	it('omits a size no listing reported rather than inventing one', () => {
		const found = collectAttachments([{ path: 'tasks/20260101-000001/a.png' }]);
		expect(found.get('20260101-000001')).toEqual([
			{ name: 'a.png', path: 'tasks/20260101-000001/a.png' }
		]);
	});

	it('finds nothing in an empty listing', () => {
		expect(collectAttachments([]).size).toBe(0);
	});
});

describe('formatSize', () => {
	it.each([
		[0, '0 B'],
		[12, '12 B'],
		[999, '999 B'],
		[1000, '1 kB'],
		[4300, '4.3 kB'],
		[41_000, '41 kB'],
		[98_000, '98 kB'],
		[143_000, '143 kB'],
		[1_500_000, '1.5 MB']
	])('renders %i bytes as %o', (bytes, expected) => {
		expect(formatSize(bytes)).toBe(expected);
	});

	it('says nothing about a size it was not given', () => {
		expect(formatSize(undefined)).toBe('');
	});
});

describe('attachmentName', () => {
	it.each([
		['Capture d’écran 2026.png', 'Capture-d-ecran-2026.png'],
		['Mon schéma (v2).png', 'Mon-schema-v2.png'],
		['.hidden.png', 'hidden.png'],
		['--odd--.png', 'odd.png'],
		['???', 'file']
	])('reduces %o to %o, which a link takes as it is', (wanted, name) => {
		expect(attachmentName(wanted, new Set())).toBe(name);
	});

	it('numbers a name the folder holds already, before its extension', () => {
		const taken = new Set(['shot.png', 'shot-2.png', 'notes']);
		expect(attachmentName('shot.png', taken)).toBe('shot-3.png');
		expect(attachmentName('notes', taken)).toBe('notes-2');
	});
});

describe('wantedImageName', () => {
	const NOW = new Date(Date.UTC(2026, 9, 12, 8, 30, 0));

	it("names a pasted screenshot, which carries the browser's generic name, after the clock", () => {
		expect(wantedImageName('image.PNG', NOW)).toBe('pasted-20261012-083000.png');
	});

	it('keeps any other name, of a file dropped or pasted from a folder', () => {
		expect(wantedImageName('plan.jpg', NOW)).toBe('plan.jpg');
		expect(wantedImageName('image-2.png', NOW)).toBe('image-2.png');
	});
});
