import { describe, expect, it } from 'vitest';
import {
	fromDirectoryEntry,
	fromDirectoryHandle,
	fromFileList,
	isWorthKeeping,
	listFolder,
	looksLikeTasksFolder,
	readBranch
} from './folder.ts';
import { directory, entryTree } from './fake-directory.ts';

/** A file as the directory input reports it, path and all. */
function entry(relativePath: string, contents = 'x'): File {
	const file = new File([contents], relativePath.split('/').pop()!);
	Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
	return file;
}

describe('isWorthKeeping', () => {
	it('keeps the tasks and the one file that names the branch', () => {
		expect(isWorthKeeping('tasks/20260101-000001/TASK.md')).toBe(true);
		expect(isWorthKeeping('tasks/tags')).toBe(true);
		expect(isWorthKeeping('.git/HEAD')).toBe(true);
	});

	it('drops what a checkout holds besides them', () => {
		// A reader picks the repository, not a subfolder of it, and node_modules
		// alone can be a hundred thousand files.
		expect(isWorthKeeping('src/lib/sources/local.ts')).toBe(false);
		expect(isWorthKeeping('node_modules/svelte/package.json')).toBe(false);
		expect(isWorthKeeping('README.md')).toBe(false);
		expect(isWorthKeeping('.git/objects/ab/cdef')).toBe(false);
	});
});

describe('fromFileList', () => {
	it('takes the folder name from the paths, there being no handle to ask', () => {
		const folder = fromFileList([entry('my-project/tasks/20260101-000001/TASK.md')]);
		expect(folder?.name).toBe('my-project');
		expect([...(folder?.files.keys() ?? [])]).toEqual(['tasks/20260101-000001/TASK.md']);
	});

	it('keeps only what this viewer reads', () => {
		const folder = fromFileList([
			entry('repo/tasks/20260101-000001/TASK.md'),
			entry('repo/tasks/tags'),
			entry('repo/.git/HEAD'),
			entry('repo/node_modules/a/index.js'),
			entry('repo/src/app.css')
		]);
		expect([...(folder?.files.keys() ?? [])].toSorted()).toEqual([
			'.git/HEAD',
			'tasks/20260101-000001/TASK.md',
			'tasks/tags'
		]);
	});

	it('gives up on a selection that carries no paths at all', () => {
		// Files chosen one by one rather than as a folder: nothing says where they
		// sit relative to each other, so there is no repository to read.
		expect(fromFileList([new File(['x'], 'TASK.md')])).toBeNull();
		expect(fromFileList([])).toBeNull();
	});
});

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
		// The case that made a mispicked folder cost minutes: everything below it
		// was walked under a `tasks/` prefix, which then read to the loader as a
		// tasks folder holding no tasks.
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

	it('accepts the tasks folder itself, which holds task folders', async () => {
		const folder = await fromDirectoryHandle(
			directory('tasks', {
				'20260101-000001/TASK.md': '# a\n',
				'20260101-000001/shot.png': 'png'
			})
		);
		expect([...folder.files.keys()].toSorted()).toEqual([
			'tasks/20260101-000001/TASK.md',
			'tasks/20260101-000001/shot.png'
		]);
	});

	it('descends `tasks/` and nothing else', async () => {
		// Walking everything and filtering after would mean reading `node_modules`
		// and every loose object under `.git` to arrive at the same files.
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

describe('listFolder', () => {
	it('reports each file with its size, as a listing does', async () => {
		const folder = await fromDirectoryHandle(
			directory('repo', { 'tasks/20260101-000001/TASK.md': '# a task\n' })
		);
		expect(listFolder(folder)).toEqual([{ path: 'tasks/20260101-000001/TASK.md', size: 9 }]);
	});
});

describe('readBranch', () => {
	// A repository, which is what has a `.git` beside its tasks.
	const withHead = async (contents: string) =>
		readBranch(
			await fromDirectoryHandle(
				directory('repo', { 'tasks/20260101-000001/TASK.md': '# a\n', '.git/HEAD': contents })
			)
		);

	it('reads the checked-out branch out of .git/HEAD', async () => {
		expect(await withHead('ref: refs/heads/main\n')).toBe('main');
		expect(await withHead('ref: refs/heads/feature/web-ui\n')).toBe('feature/web-ui');
	});

	it('says nothing for a detached HEAD, a commit id being no branch', async () => {
		expect(await withHead('9f1c0e2d3b4a5968778695a4b3c2d1e0f9a8b7c6\n')).toBeUndefined();
	});

	it('says nothing when the folder is not a checkout at all', async () => {
		const folder = await fromDirectoryHandle(
			directory('repo', { 'tasks/20260101-000001/TASK.md': '# a\n' })
		);
		expect(await readBranch(folder)).toBeUndefined();
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

describe('picking the tasks folder itself', () => {
	// Why it is allowed: a directory input makes the browser ask about every file
	// in the folder by count ("import 7,775 files?" for a checkout), and picking
	// `tasks/` makes that question about the tasks alone.
	it('puts the paths back where the rest of the viewer expects them', () => {
		const folder = fromFileList([
			entry('tasks/20260101-000001/TASK.md'),
			entry('tasks/20260101-000001/shot.png'),
			entry('tasks/tags')
		]);
		expect([...(folder?.files.keys() ?? [])].toSorted()).toEqual([
			'tasks/20260101-000001/TASK.md',
			'tasks/20260101-000001/shot.png',
			'tasks/tags'
		]);
	});

	it('does the same for a handle', async () => {
		const folder = await fromDirectoryHandle(
			directory('tasks', {
				'20260101-000001/TASK.md': '# a\n',
				tags: 'ui , screens\n'
			})
		);
		expect([...folder.files.keys()].toSorted()).toEqual([
			'tasks/20260101-000001/TASK.md',
			'tasks/tags'
		]);
	});

	it('costs the branch, there being no .git beside the tasks', async () => {
		const folder = await fromDirectoryHandle(
			directory('tasks', {
				'20260101-000001/TASK.md': '# a\n',
				// Even if one were there, a tasks folder is not a repository root.
				'.git/HEAD': 'ref: refs/heads/main\n'
			})
		);
		expect(await readBranch(folder)).toBeUndefined();
	});
});

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
		// `readEntries` answers a page at a time and ends with an empty array, so
		// calling it once looks like it worked and loses the rest. Five tasks
		// through a reader that returns two at a time is the shape that catches it.
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
	// The widest door, and the one with no dialog in front of it: on Firefox and
	// Safari a drop hands over the legacy entry tree, so nothing asked the reader
	// to confirm a file count before this walk began.
	it('is read as empty rather than walked whole', async () => {
		const folder = await fromDirectoryEntry(
			entryTree('Downloads', { 'invoices/march.pdf': 'pdf', 'notes.txt': 'x' })
		);
		expect([...folder.files.keys()]).toEqual([]);
	});

	it('still accepts a dropped tasks folder', async () => {
		const folder = await fromDirectoryEntry(
			entryTree('tasks', { '20260101-000001/TASK.md': '# a\n' })
		);
		expect([...folder.files.keys()]).toEqual(['tasks/20260101-000001/TASK.md']);
	});
});
