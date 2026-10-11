import type { ViteHotContext } from 'vite/types/hot.d.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scratchFolder, serving, writeTree } from '#tests/support/disk-tree.ts';
import { unreachable } from '#tests/support/network.ts';
import { isCached, isFollowable, isRereadable } from '../capabilities.ts';
import { loadRepository } from '../load.ts';
import { memoryStore } from '../store.ts';
import { SourceError } from '../contract.ts';
import { FollowedServedSource, ServedSource } from './source.ts';
import { CHANGED } from './protocol.ts';

/**
 * The page half against the server half, with nothing between them but the
 * answer the dev server would send: no HTTP, but no mock of either side.
 */
const scratch = scratchFolder();

beforeEach(async () => {
	await writeTree(scratch(), {
		'tasks/20260101-000001/TASK.md': '# Served\n\n- STATUS: OPEN\n- PRIORITY: 90\n- TAGS: ui\n',
		'tasks/20260101-000002/TASK.md': '# Done\n\n- STATUS: CLOSED\n- PRIORITY: 50\n',
		'tasks/tags': 'ui , screens\n',
		'.git/HEAD': 'ref: refs/heads/main\n',
		'README.md': '# not a task\n'
	});
});

const open = async () => new ServedSource('my-project', await serving(scratch()));

describe('the served folder, as a source', () => {
	it('names itself after the folder, and keeps no cache of it', async () => {
		const source = await open();
		expect(source.label).toBe('my-project');
		expect(isCached(source)).toBe(false);
		expect(isRereadable(source)).toBe(true);
	});

	it('lists the folder, with its branch', async () => {
		const listing = await (await open()).list();
		expect(listing.branch).toBe('main');
		expect(listing.entries.map((entry) => entry.path)).toContain('tasks/tags');
	});

	it('reads a file, and answers null for one it may not read', async () => {
		const source = await open();
		expect(await source.read('tasks/20260101-000001/TASK.md')).toContain('# Served');
		expect(await source.read('README.md')).toBeNull();
		expect(await source.read('tasks/../README.md')).toBeNull();
	});

	it('points an attachment at the dev server', async () => {
		expect((await open()).assetUrl('tasks/20260101-000001/a b.png')).toBe(
			'/__tatr/served/files/tasks/20260101-000001/a%20b.png'
		);
	});

	it('says the dev server did not answer, rather than that there is nothing', async () => {
		const source = new ServedSource('my-project', unreachable);
		await expect(source.list()).rejects.toThrow(SourceError);
	});

	it('loads as a repository like any other', async () => {
		const result = await loadRepository(await open(), { store: memoryStore() });
		expect(result.tasks.map((task) => task.id)).toEqual(['20260101-000001', '20260101-000002']);
		expect(result.tags.descriptions.get('ui')).toBe('screens');
	});

	it('follows the folder over the dev channel, until told to stop', () => {
		const heard = new Map<string, () => void>();
		const channel = {
			on: (event: string, handler: () => void) => heard.set(event, handler),
			off: (event: string) => heard.delete(event)
		} as unknown as ViteHotContext;
		const changed = vi.fn();

		const stop = new FollowedServedSource('my-project', channel).follow(changed);
		heard.get(CHANGED)?.();
		expect(changed).toHaveBeenCalledTimes(1);

		stop();
		expect(heard.has(CHANGED)).toBe(false);
	});

	it('follows nothing outside a dev server, there being no channel to hear from', async () => {
		expect(isFollowable(ServedSource.open())).toBe(false);
	});
});
