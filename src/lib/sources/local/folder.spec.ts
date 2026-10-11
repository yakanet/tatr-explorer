import { describe, expect, it } from 'vitest';
import { fileList } from '#tests/support/fake-directory.ts';
import {
	fromFileList,
	isWorthKeeping,
	listFolder,
	looksLikeTasksFolder,
	readBranch
} from './folder.ts';

describe('isWorthKeeping', () => {
	it('keeps the tasks and the one file that names the branch', () => {
		expect(isWorthKeeping('tasks/20260101-000001/TASK.md')).toBe(true);
		expect(isWorthKeeping('tasks/tags')).toBe(true);
		expect(isWorthKeeping('.git/HEAD')).toBe(true);
	});

	it('drops what a checkout holds besides them', () => {
		expect(isWorthKeeping('src/lib/sources/local.ts')).toBe(false);
		expect(isWorthKeeping('node_modules/svelte/package.json')).toBe(false);
		expect(isWorthKeeping('README.md')).toBe(false);
		expect(isWorthKeeping('.git/objects/ab/cdef')).toBe(false);
	});
});

describe('fromFileList', () => {
	it('takes the folder name from the paths, there being no handle to ask', () => {
		const folder = fromFileList(
			fileList('my-project', { 'tasks/20260101-000001/TASK.md': '# a\n' })
		);
		expect(folder?.name).toBe('my-project');
		expect([...(folder?.files.keys() ?? [])]).toEqual(['tasks/20260101-000001/TASK.md']);
	});

	it('keeps only what this viewer reads', () => {
		const folder = fromFileList(
			fileList('repo', {
				'tasks/20260101-000001/TASK.md': '# a\n',
				'tasks/tags': 'ui , screens\n',
				'.git/HEAD': 'ref: refs/heads/main\n',
				'node_modules/a/index.js': 'x',
				'src/app.css': 'body{}'
			})
		);
		expect([...(folder?.files.keys() ?? [])].toSorted()).toEqual([
			'.git/HEAD',
			'tasks/20260101-000001/TASK.md',
			'tasks/tags'
		]);
	});

	it('gives up on a selection that carries no paths at all', () => {
		// Files picked one by one, not as a folder, carry no relative path.
		expect(fromFileList([new File(['x'], 'TASK.md')])).toBeNull();
		expect(fromFileList([])).toBeNull();
	});

	it('accepts the tasks folder itself, putting the paths back', () => {
		const folder = fromFileList(
			fileList('tasks', {
				'20260101-000001/TASK.md': '# a\n',
				'20260101-000001/shot.png': 'png',
				tags: 'ui , screens\n'
			})
		);
		expect([...(folder?.files.keys() ?? [])].toSorted()).toEqual([
			'tasks/20260101-000001/TASK.md',
			'tasks/20260101-000001/shot.png',
			'tasks/tags'
		]);
	});
});

describe('listFolder', () => {
	it('reports each file with its size, as a listing does', async () => {
		const folder = fromFileList(
			fileList('repo', { 'tasks/20260101-000001/TASK.md': '# a task\n' })
		);
		expect(listFolder(folder!)).toEqual([{ path: 'tasks/20260101-000001/TASK.md', size: 9 }]);
	});
});

describe('readBranch', () => {
	// A repository root, the only place `.git/HEAD` is read from.
	const withHead = (contents: string) =>
		readBranch(
			fromFileList(
				fileList('repo', { 'tasks/20260101-000001/TASK.md': '# a\n', '.git/HEAD': contents })
			)!
		);

	it('reads the checked-out branch out of .git/HEAD', async () => {
		expect(await withHead('ref: refs/heads/main\n')).toBe('main');
		expect(await withHead('ref: refs/heads/feature/web-ui\n')).toBe('feature/web-ui');
	});

	it('says nothing for a detached HEAD, a commit id being no branch', async () => {
		expect(await withHead('9f1c0e2d3b4a5968778695a4b3c2d1e0f9a8b7c6\n')).toBeUndefined();
	});

	it('says nothing when the folder is not a checkout at all', async () => {
		const folder = fromFileList(fileList('repo', { 'tasks/20260101-000001/TASK.md': '# a\n' }));
		expect(await readBranch(folder!)).toBeUndefined();
	});
});

describe('looksLikeTasksFolder', () => {
	it('recognises a folder of task folders', () => {
		expect(
			looksLikeTasksFolder(['20260101-000001/TASK.md', '20260101-000002/TASK.md', 'tags'])
		).toBe(true);
	});

	it('says no when the tasks folder is inside, as in a checkout', () => {
		expect(looksLikeTasksFolder(['tasks/20260101-000001/TASK.md', 'README.md'])).toBe(false);
	});

	it('says no about a folder holding no task at all', () => {
		expect(looksLikeTasksFolder(['src/app.css', 'README.md'])).toBe(false);
		expect(looksLikeTasksFolder([])).toBe(false);
	});
});
