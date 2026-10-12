import { readFile, stat, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { describe, expect, it, onTestFinished } from 'vitest';
import { fromPage, scratchFolder, writeTree } from '#tests/support/disk-tree.ts';
import {
	answer,
	diskPath,
	listing,
	locate,
	newDiskPath,
	serve,
	tatrServedFolder,
	type ServedFolder
} from './folder.server.ts';
import { tagOf } from './protocol.ts';

/**
 * Real folders, because these specs pin how the disk behaves: symbolic links,
 * `..`, a folder that is its own `tasks/`.
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

/** The one task of the repository, by its path from the root. */
const TASK = 'tasks/20260101-000001/TASK.md';

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
		const reply = await answer(await locate(await repository()), fromPage('/'));
		expect(reply?.status).toBe(302);
		expect(reply?.headers.get('location')).toBe('/served');
	});

	it('leaves every other request to Vite and SvelteKit', async () => {
		const served = await locate(await repository());
		expect(await answer(served, fromPage('/served'))).toBeNull();
		expect(await answer(served, fromPage('/src/app.css'))).toBeNull();
	});

	it('answers the listing as JSON', async () => {
		const reply = await answer(
			await locate(await repository()),
			fromPage('/__tatr/served/listing')
		);
		expect(reply?.status).toBe(200);
		expect((await reply?.json()).branch).toBe('wip');
	});

	it('serves a file raw, sandboxed against its own scripts', async () => {
		const reply = await answer(
			await locate(await repository()),
			fromPage('/__tatr/served/files/tasks/20260101-000001/shot.png')
		);
		expect(reply?.status).toBe(200);
		expect(reply?.headers.get('content-type')).toBe('image/png');
		expect(reply?.headers.get('content-security-policy')).toBe('sandbox');
		expect(await reply?.text()).toBe('png');
	});

	it('refuses a path climbing out, encoded slashes included', async () => {
		const served = await locate(await repository());
		const reply = await answer(served, fromPage('/__tatr/served/files/tasks%2F..%2FREADME.md'));
		expect(reply?.status).toBe(404);
	});

	it('refuses an encoding that does not decode', async () => {
		const reply = await answer(
			await locate(await repository()),
			fromPage('/__tatr/served/files/%E0%A4%A')
		);
		expect(reply?.status).toBe(400);
	});

	it('answers only the methods each route has', async () => {
		const served = await locate(await repository());
		const listed = await answer(served, fromPage('/__tatr/served/listing', { method: 'PUT' }));
		expect(listed?.status).toBe(405);
		const removed = await answer(
			served,
			fromPage(`/__tatr/served/files/${TASK}`, { method: 'DELETE' })
		);
		expect(removed?.status).toBe(405);
		expect(removed?.headers.get('allow')).toBe('GET, PUT');
	});
});

/** A `PUT` of `file`, from this dev server's page unless `headers` names another origin. */
const put = (file: string, body: string, headers: Record<string, string>) =>
	fromPage(`/__tatr/served/files/${file}`, { method: 'PUT', body, headers });

/** The repository served, its root, and a reader of its task file on disk. */
const opened = async () => {
	const root = await repository();
	return {
		root,
		served: await locate(root),
		onDisk: () => readFile(path.join(root, TASK), 'utf8')
	};
};

describe('writing a task file', () => {
	it('replaces a task file whole, over the version it was read as', async () => {
		const { served, onDisk } = await opened();
		const reply = await answer(served, put(TASK, '# b\n', { 'if-match': await tagOf('# a\n') }));
		expect(reply?.status).toBe(204);
		expect(await onDisk()).toBe('# b\n');
	});

	it('refuses a write over a version it did not read, rather than lose an edit', async () => {
		const { served, onDisk } = await opened();
		const reply = await answer(served, put(TASK, '# b\n', { 'if-match': await tagOf('# x\n') }));
		expect(reply?.status).toBe(412);
		expect(await onDisk()).toBe('# a\n');
	});

	it('refuses a write that names no version, having nothing to compare', async () => {
		const { served, onDisk } = await opened();
		expect((await answer(served, put(TASK, '# b\n', {})))?.status).toBe(428);
		expect(await onDisk()).toBe('# a\n');
	});

	it("refuses another page's write, one served from another port of this machine included", async () => {
		const { served, onDisk } = await opened();
		const expected = await tagOf('# a\n');
		for (const origin of ['http://localhost:3000', 'https://example.com', '']) {
			const reply = await answer(served, put(TASK, '# b\n', { origin, 'if-match': expected }));
			expect(reply?.status).toBe(403);
		}
		expect(await onDisk()).toBe('# a\n');
	});

	it('creates no file without being asked to: only one already there is replaced', async () => {
		// The paths a write may reach are those a read may, pinned above.
		const { served } = await opened();
		const file = 'tasks/20260101-000002/TASK.md';
		const reply = await answer(served, put(file, '# b\n', { 'if-match': await tagOf('# a\n') }));
		expect(reply?.status).toBe(404);
	});
});

describe('creating a file', () => {
	/** A creation of `file`, which is a `PUT` sent with `If-None-Match: *`. */
	const create = (file: string, body: string, headers: Record<string, string> = {}) =>
		put(file, body, { 'if-none-match': '*', ...headers });

	it('creates a file and the folders missing on the way', async () => {
		const { root, served } = await opened();
		const file = 'tasks/20260101-000002/TASK.md';
		expect((await answer(served, create(file, '# b\n')))?.status).toBe(201);
		expect(await readFile(path.join(root, file), 'utf8')).toBe('# b\n');
	});

	it('refuses to create over a file that is there, rather than replace it unread', async () => {
		const { served, onDisk } = await opened();
		expect((await answer(served, create(TASK, '# b\n')))?.status).toBe(412);
		expect(await onDisk()).toBe('# a\n');
	});

	it.each(['README.md', 'tasks/../README.md', 'tasks/../../outside', 'tasks', 'tasks/'])(
		'creates nothing at %o, which is outside the tasks',
		async (page) => {
			expect(await newDiskPath(await locate(await repository()), page)).toBeNull();
		}
	);

	it('creates nothing through a symbolic link, even to a folder of the same tasks', async () => {
		const root = await repository();
		await symlink(path.join(root, 'tasks/20260101-000001'), path.join(root, 'tasks/link'));
		const served = await locate(root);
		expect(await newDiskPath(served, 'tasks/link/TASK.md')).toBeNull();
		expect((await answer(served, create('tasks/link/new.md', 'x')))?.status).toBe(403);
		await expect(stat(path.join(root, 'tasks/20260101-000001/new.md'))).rejects.toThrow();
	});

	it("refuses another page's creation", async () => {
		const { root, served } = await opened();
		const file = 'tasks/20260101-000002/TASK.md';
		const reply = await answer(served, create(file, '# b\n', { origin: 'http://localhost:3000' }));
		expect(reply?.status).toBe(403);
		await expect(stat(path.join(root, file))).rejects.toThrow();
	});
});

describe('the middleware, on a real server', () => {
	/**
	 * Runs `serve` on a local port, with a next handler that records the bodies
	 * it receives. Returns the address and those bodies.
	 */
	const listening = async (served: ServedFolder) => {
		const passed: string[] = [];
		const server = createServer((req, res) =>
			serve(served)(req, res, async () => {
				passed.push(await text(req));
				res.end();
			})
		);
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
		return { at: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, passed };
	};

	it('compares the origin of a write with the address it was sent to', async () => {
		const root = await repository();
		const { at } = await listening(await locate(root));
		const write = (origin: string) =>
			fetch(`${at}/__tatr/served/files/${TASK}`, {
				method: 'PUT',
				headers: { origin, 'if-match': '"none"' },
				body: '# b\n'
			});

		// With the origin accepted, the stale version is what refuses the write.
		expect((await write(at)).status).toBe(412);
		expect((await write('http://127.0.0.1:1')).status).toBe(403);
	});

	it('leaves the body of a request it does not answer for the next handler', async () => {
		const { at, passed } = await listening(await locate(await repository()));
		await fetch(`${at}/elsewhere`, { method: 'POST', body: 'kept' });
		expect(passed).toEqual(['kept']);
	});
});

describe('the plugin', () => {
	const define = (folder: string | undefined, command: 'serve' | 'build') => {
		const config = tatrServedFolder(folder).config as (
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
