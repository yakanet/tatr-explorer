import { describe, expect, it } from 'vitest';
import { entryTree } from '#tests/support/fake-directory.ts';
import { fromDirectoryEntry } from './directory-entry.ts';
import { readBranch } from './folder.ts';

describe('fromDirectoryEntry', () => {
	it('reads a dropped repository', async () => {
		const folder = await fromDirectoryEntry(
			entryTree('my-project', {
				'tasks/20260101-000001/TASK.md': '# a\n',
				'tasks/20260101-000002/TASK.md': '# b\n',
				'tasks/tags': 'ui , screens\n',
				'.git/HEAD': 'ref: refs/heads/main\n',
				'src/app.css': 'body{}'
			})
		);
		expect(folder.name).toBe('my-project');
		expect([...folder.files.keys()].toSorted()).toEqual([
			'.git/HEAD',
			'tasks/20260101-000001/TASK.md',
			'tasks/20260101-000002/TASK.md',
			'tasks/tags'
		]);
		expect(await readBranch(folder)).toBe('main');
	});

	it('keeps reading until the reader says it is done', async () => {
		// Five tasks through a reader that answers two at a time take three pages.
		const tree: Record<string, string> = {};
		for (let i = 1; i <= 5; i++) tree[`tasks/2026010${i}-000001/TASK.md`] = `# ${i}\n`;

		const folder = await fromDirectoryEntry(entryTree('repo', tree, 2));
		expect(folder.files.size).toBe(5);
	});

	it('reads a dropped tasks folder, putting the paths back', async () => {
		const folder = await fromDirectoryEntry(
			entryTree('tasks', { '20260101-000001/TASK.md': '# a\n', tags: 'ui , a\n' })
		);
		expect([...folder.files.keys()].toSorted()).toEqual([
			'tasks/20260101-000001/TASK.md',
			'tasks/tags'
		]);
	});
});

describe('a dropped folder that holds no tasks', () => {
	it('is read as empty rather than walked whole', async () => {
		const folder = await fromDirectoryEntry(
			entryTree('Downloads', { 'invoices/march.pdf': 'pdf', 'notes.txt': 'x' })
		);
		expect([...folder.files.keys()]).toEqual([]);
	});
});
