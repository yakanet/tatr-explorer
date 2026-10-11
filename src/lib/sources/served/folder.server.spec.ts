import { symlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scratchFolder, writeTree } from '../../../../tests/support/disk-tree.ts';
import { answer, diskPath, listing, locate, servedFolder } from './folder.server.ts';

/**
 * Real folders on the disk, because what is worth pinning here is what the disk
 * does: symbolic links, `..`, a folder that is its own `tasks/`.
 */
const scratch = scratchFolder();

const folder = (name: string, tree: Record<string, string>) =>
	writeTree(path.join(scratch(), name), tree);

const repository = () =>
	folder('my-project', {
		'tasks/20260101-000001/TASK.md': '# a\n',
		'tasks/20260101-000001/shot.png': 'png',
		'tasks/tags': 'ui , screens\n',
		'.git/HEAD': 'ref: refs/heads/wip\n',
		'README.md': '# not a task\n'
	});

/** A request as the dev server hands it over. */
const get = (pathname: string, method = 'GET') =>
	new Request(new URL(pathname, 'http://localhost'), { method });

describe('locating the tasks', () => {
	it('finds them in `tasks/`, as in a repository', async () => {
		const served = await locate(await repository());
		expect(served.tasks).toBe(path.join(served.root, 'tasks'));
	});

	it('takes a folder of task folders for a `tasks/` folder itself', async () => {
		const served = await locate(await folder('tasks', { '20260101-000001/TASK.md': '# a\n' }));
		expect(served.tasks).toBe(served.root);
	});

	it('finds none in a folder that is neither', async () => {
		expect((await locate(await folder('notes', { 'a.md': 'x' }))).tasks).toBeNull();
	});
});

describe('the listing', () => {
	it('names every file under the tasks, in order, and the branch', async () => {
		const result = await listing(await locate(await repository()));
		expect(result.entries.map((entry) => entry.path)).toEqual([
			'tasks/20260101-000001/shot.png',
			'tasks/20260101-000001/TASK.md',
			'tasks/tags'
		]);
		expect(result.entries.find((entry) => entry.path === 'tasks/tags')?.size).toBe(13);
		expect(result.branch).toBe('wip');
	});

	it('puts a tasks folder served on its own under `tasks/`, as a working tree', async () => {
		const result = await listing(
			await locate(await folder('tasks', { '20260101-000001/TASK.md': '# a\n' }))
		);
		expect(result.entries.map((entry) => entry.path)).toEqual(['tasks/20260101-000001/TASK.md']);
		expect(result.branch).toBe('working tree');
	});

	it('leaves symbolic links out, the one way to stand for a file elsewhere', async () => {
		const root = await repository();
		await symlink(path.join(root, 'README.md'), path.join(root, 'tasks/20260101-000001/link.md'));
		const result = await listing(await locate(root));
		expect(result.entries.map((entry) => entry.path)).not.toContain(
			'tasks/20260101-000001/link.md'
		);
	});
});

describe('what may be read', () => {
	it('reads a task file', async () => {
		const served = await locate(await repository());
		expect(await diskPath(served, 'tasks/20260101-000001/TASK.md')).toBe(
			path.join(served.root, 'tasks/20260101-000001/TASK.md')
		);
	});

	it.each(['README.md', '.git/HEAD', 'tasks/../README.md', 'tasks/../../outside', 'tasks'])(
		'refuses %o, which is not a task file',
		async (page) => {
			expect(await diskPath(await locate(await repository()), page)).toBeNull();
		}
	);

	it('refuses a symbolic link out of `tasks/`, even into the same folder', async () => {
		const root = await repository();
		await symlink(path.join(root, 'README.md'), path.join(root, 'tasks/20260101-000001/link.md'));
		expect(await diskPath(await locate(root), 'tasks/20260101-000001/link.md')).toBeNull();
	});
});

describe('what the dev server answers', () => {
	it('sends `/` to the folder, so the server opens on it', async () => {
		const reply = await answer(await locate(await repository()), get('/'));
		expect(reply?.status).toBe(302);
		expect(reply?.headers.get('location')).toBe('/served');
	});

	it('leaves every other request to Vite and SvelteKit', async () => {
		const served = await locate(await repository());
		expect(await answer(served, get('/served'))).toBeNull();
		expect(await answer(served, get('/src/app.css'))).toBeNull();
	});

	it('answers the listing as JSON', async () => {
		const reply = await answer(await locate(await repository()), get('/__tatr/served/listing'));
		expect(reply?.status).toBe(200);
		expect((await reply?.json()).branch).toBe('wip');
	});

	it('serves a file raw, sandboxed against its own scripts', async () => {
		const reply = await answer(
			await locate(await repository()),
			get('/__tatr/served/files/tasks/20260101-000001/shot.png')
		);
		expect(reply?.status).toBe(200);
		expect(reply?.headers.get('content-type')).toBe('image/png');
		expect(reply?.headers.get('content-security-policy')).toBe('sandbox');
		expect(await reply?.text()).toBe('png');
	});

	it('refuses a path climbing out, encoded slashes included', async () => {
		const served = await locate(await repository());
		const reply = await answer(served, get('/__tatr/served/files/tasks%2F..%2FREADME.md'));
		expect(reply?.status).toBe(404);
	});

	it('refuses an encoding that does not decode', async () => {
		const reply = await answer(
			await locate(await repository()),
			get('/__tatr/served/files/%E0%A4%A')
		);
		expect(reply?.status).toBe(400);
	});

	it('reads only: writing through the folder is a capability of its own', async () => {
		const served = await locate(await repository());
		const reply = await answer(
			served,
			get('/__tatr/served/files/tasks/20260101-000001/TASK.md', 'PUT')
		);
		expect(reply?.status).toBe(405);
	});
});

describe('the plugin', () => {
	const define = (folder: string | undefined, command: 'serve' | 'build') => {
		const config = servedFolder(folder).config as (
			config: unknown,
			env: { command: 'serve' | 'build' }
		) => { define: Record<string, string> };
		return config({}, { command }).define.__TATR_SERVED__;
	};

	it('names the folder to the page in a dev server that serves one', () => {
		expect(define('../somewhere/my-project', 'serve')).toBe('"my-project"');
	});

	it('defines false otherwise, which the bundler folds away', () => {
		expect(define(undefined, 'serve')).toBe('false');
		expect(define('../somewhere/my-project', 'build')).toBe('false');
	});
});
