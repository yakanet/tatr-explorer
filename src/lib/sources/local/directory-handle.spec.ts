import { describe, expect, it } from 'vitest';
import { directory } from '#tests/support/fake-directory.ts';
import { fromDirectoryHandle } from './directory-handle.ts';
import { readBranch } from './folder.ts';

describe('fromDirectoryHandle', () => {
	it('walks down to the task files', async () => {
		const folder = await fromDirectoryHandle(
			directory('my-project', {
				'tasks/20260101-000001/TASK.md': '# a\n',
				'tasks/20260101-000001/shot.png': 'png',
				'tasks/tags': 'ui , screens\n',
				'.git/HEAD': 'ref: refs/heads/main\n',
				'src/app.css': 'body{}'
			})
		);
		expect(folder.name).toBe('my-project');
		expect([...folder.files.keys()].toSorted()).toEqual([
			'.git/HEAD',
			'tasks/20260101-000001/TASK.md',
			'tasks/20260101-000001/shot.png',
			'tasks/tags'
		]);
	});

	it('refuses a folder that is neither a repository nor a tasks folder', async () => {
		const folder = await fromDirectoryHandle(
			directory('Documents', {
				'notes/shopping.md': 'milk',
				'photos/a.png': 'png',
				'README.md': '# not a repository\n'
			})
		);
		expect([...folder.files.keys()]).toEqual([]);
		expect(folder.name).toBe('Documents');
	});

	it('accepts the tasks folder itself, putting the paths back', async () => {
		const folder = await fromDirectoryHandle(
			directory('tasks', {
				'20260101-000001/TASK.md': '# a\n',
				'20260101-000001/shot.png': 'png',
				tags: 'ui , screens\n'
			})
		);
		expect([...folder.files.keys()].toSorted()).toEqual([
			'tasks/20260101-000001/TASK.md',
			'tasks/20260101-000001/shot.png',
			'tasks/tags'
		]);
	});

	it('gives no branch for the tasks folder itself', async () => {
		const folder = await fromDirectoryHandle(
			directory('tasks', {
				'20260101-000001/TASK.md': '# a\n',
				// Even if one were there, a tasks folder is not a repository root.
				'.git/HEAD': 'ref: refs/heads/main\n'
			})
		);
		expect(await readBranch(folder)).toBeUndefined();
	});

	it('descends `tasks/` and nothing else', async () => {
		const visited: string[] = [];
		const repo = directory('repo', {
			'tasks/20260101-000001/TASK.md': '# a\n',
			'node_modules/svelte/index.js': 'x',
			'.git/objects/ab/cdef': 'x',
			'.git/HEAD': 'ref: refs/heads/main\n'
		});
		const watched = {
			...repo,
			getDirectoryHandle: async (name: string) => {
				visited.push(name);
				return repo.getDirectoryHandle(name);
			}
		} as unknown as FileSystemDirectoryHandle;

		const folder = await fromDirectoryHandle(watched);
		expect([...folder.files.keys()].toSorted()).toEqual([
			'.git/HEAD',
			'tasks/20260101-000001/TASK.md'
		]);
		expect(visited).toEqual(['tasks', '.git']);
	});

	it('reads HEAD by name rather than by walking .git', async () => {
		const folder = await fromDirectoryHandle(
			directory('repo', {
				'tasks/20260101-000001/TASK.md': '# a\n',
				'.git/HEAD': 'ref: refs/heads/wip\n'
			})
		);
		expect(await readBranch(folder)).toBe('wip');
	});
});
