import { afterEach, describe, expect, it } from 'vitest';
import { KINDS, openSource } from './open.ts';
import { localRef, parseRepoPath, type RepoRef } from '../repo/ref.ts';
import { fromFileList } from './local/folder.ts';
import { closeFolder, openFolder } from './local/kind.ts';

const refs: RepoRef[] = [
	parseRepoPath('owner/repo')!,
	parseRepoPath('owner/repo@main')!,
	parseRepoPath('gitlab.com/group/project')!,
	localRef('my-project')
];

describe('the registry', () => {
	it('keys every kind by its own id', () => {
		// The one thing a literal cannot check itself: that the key written out
		// is the id the kind answers to.
		for (const [key, kind] of Object.entries(KINDS)) expect(key).toBe(kind.id);
	});

	it('holds the kinds this app has, named', () => {
		expect(Object.keys(KINDS).toSorted()).toEqual(['github', 'local']);
	});

	it('is closed to writing, so nothing can register a kind at runtime', () => {
		expect(() => {
			(KINDS as Record<string, unknown>).sneaky = {};
		}).toThrow();
	});

	it('claims nothing twice', () => {
		// The property a record depends on: with disjoint claims there is no
		// precedence to encode, so nothing rests on the order of the keys.
		for (const ref of refs) {
			const claimants = Object.values(KINDS).filter((kind) => kind.claims(ref));
			expect(claimants.map((kind) => kind.id)).toHaveLength(1);
		}
	});
});

describe('openSource', () => {
	it('opens a repository on a forge', () => {
		const source = openSource(parseRepoPath('owner/repo')!);
		expect(source?.id).toBe('github');
		expect(source?.label).toBe('owner/repo');
		expect(source?.cacheKey).toBe('github.com/owner/repo@');
		expect(source?.fileUrl?.('tasks/a/TASK.md')).toContain('/blob/HEAD/tasks/a/TASK.md');
	});

	it('reads a forge at the branch it was asked for', () => {
		const source = openSource(parseRepoPath('owner/repo')!, { branch: 'dev' });
		expect(source?.assetUrl('tasks/a/shot.png')).toContain('/repo/dev/tasks/a/shot.png');
	});

	it('opens the folder on this machine', () => {
		const source = openSource(localRef());
		expect(source?.id).toBe('local');
		// The two members that say what a folder is: nowhere to cache it, and no
		// page anywhere to link one of its files to.
		expect(source?.cacheKey).toBeNull();
		expect(source?.fileUrl).toBeUndefined();
	});
});

/** A file as the directory input reports it. */
function dropped(path: string, text: string): File {
	const file = new File([text], path.split('/').pop()!);
	Object.defineProperty(file, 'webkitRelativePath', { value: `my-project/${path}` });
	return file;
}

/**
 * What each source does when asked, rather than what it says about itself.
 *
 * The loader's tests cover the reading; these cover the seam it now reads
 * through, which nothing else touches directly.
 */
describe('reading through a forge', () => {
	const ref = parseRepoPath('owner/repo')!;

	it('reads a file from the CDN', async () => {
		const asked: string[] = [];
		const fetchImpl = (async (url: RequestInfo | URL) => {
			asked.push(String(url));
			return new Response('# a task\n', { status: 200 });
		}) as unknown as typeof fetch;

		const source = openSource(ref, { fetchImpl })!;
		expect(await source.read('tasks/a/TASK.md')).toBe('# a task\n');
		expect(asked).toEqual(['https://raw.githubusercontent.com/owner/repo/HEAD/tasks/a/TASK.md']);
	});

	it('answers null for a file the CDN refuses, rather than throwing', async () => {
		const fetchImpl = (async () =>
			new Response('nope', { status: 404 })) as unknown as typeof fetch;
		expect(await openSource(ref, { fetchImpl })!.read('tasks/a/TASK.md')).toBeNull();
	});

	it('answers null when the network does not answer at all', async () => {
		// A read that throws would take the whole load down; one task that cannot
		// be read is listed as skipped instead.
		const fetchImpl = (async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		expect(await openSource(ref, { fetchImpl })!.read('tasks/a/TASK.md')).toBeNull();
	});

	it('can be refreshed, having only a request to spend', () => {
		const source = openSource(ref)!;
		expect(source.repeatable).toBe(true);
		// Nothing for the source to do: a forge's refresh is the loader ignoring
		// the cache.
		expect(source.refresh).toBeUndefined();
	});
});

describe('reading through a folder', () => {
	const open = (files: File[]) => {
		openFolder(fromFileList(files)!);
		return openSource(localRef())!;
	};

	afterEach(() => closeFolder());

	it('reads a file that is already in memory', async () => {
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# from the disk\n')]);
		expect(await source.read('tasks/20260101-000001/TASK.md')).toBe('# from the disk\n');
	});

	it('answers null for a path the folder does not hold', async () => {
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(await source.read('tasks/20260101-000002/TASK.md')).toBeNull();
		expect(source.assetUrl('tasks/20260101-000002/shot.png')).toBeNull();
	});

	it('names itself after the folder, which no URL carries', () => {
		expect(open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]).label).toBe('my-project');
	});

	it('cannot be refreshed when the folder came from a directory input', () => {
		// No handle was kept, so there is no way back to the folder: the view
		// offers to reopen rather than a Refresh that would do nothing.
		const source = open([dropped('tasks/20260101-000001/TASK.md', '# a\n')]);
		expect(source.repeatable).toBe(false);
		expect(source.refresh).toBeTypeOf('function');
	});

	it('says so when there is no folder open, rather than listing nothing', async () => {
		closeFolder();
		await expect(openSource(localRef())!.list()).rejects.toThrow(/No folder is open/);
	});
});
