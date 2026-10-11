import { describe, expect, it } from 'vitest';
import { unreachable } from '#tests/support/network.ts';
import { GitHubRepositorySource } from './source.ts';
import { parseRepoInput } from '../../repo/ref.ts';

const ref = parseRepoInput('owner/repo')!;
const path = 'tasks/20260304-115038/TASK.md';

/** Opens a source through `open`, as the application does. */
const open = (repo = ref, branch?: string) =>
	GitHubRepositorySource.open({ ...repo, branch, source: 'github' });

/** A source whose network answers every request with `answer()`. */
const answering = (answer: () => Response) =>
	new GitHubRepositorySource(ref, (async () => answer()) as unknown as typeof fetch);

describe('reading a file', () => {
	it('reads it from the CDN', async () => {
		const asked: string[] = [];
		const network = (async (url: RequestInfo | URL) => {
			asked.push(String(url));
			return new Response('# a task\n', { status: 200 });
		}) as unknown as typeof fetch;

		expect(await new GitHubRepositorySource(ref, network).read(path)).toBe('# a task\n');
		expect(asked).toEqual([`https://raw.githubusercontent.com/owner/repo/HEAD/${path}`]);
	});

	it('answers null for a file the CDN refuses, rather than throwing', async () => {
		expect(await answering(() => new Response('nope', { status: 404 })).read(path)).toBeNull();
	});

	it('answers null when the network does not answer at all', async () => {
		expect(await new GitHubRepositorySource(ref, unreachable).read(path)).toBeNull();
	});
});

describe('the URL of a file', () => {
	it('reads it from the CDN that costs no budget', () => {
		expect(open().assetUrl(path)).toBe(
			'https://raw.githubusercontent.com/owner/repo/HEAD/tasks/20260304-115038/TASK.md'
		);
	});

	it('keeps the slashes of a branch that has them', () => {
		expect(open(ref, 'feature/web-ui').assetUrl(path)).toContain('/repo/feature/web-ui/tasks/');
	});

	it('encodes what a segment cannot carry', () => {
		expect(open().assetUrl('tasks/a b/TASK.md')).toContain('/tasks/a%20b/TASK.md');
	});
});

describe('the URL of its page on the forge', () => {
	it('points at the file, where its history is', () => {
		expect(open().fileUrl(path)).toBe(
			'https://github.com/owner/repo/blob/HEAD/tasks/20260304-115038/TASK.md'
		);
	});

	it('keeps a branch with slashes, as the raw URL does', () => {
		expect(open(ref, 'feature/web-ui').fileUrl(path)).toContain('/blob/feature/web-ui/tasks/');
	});
});

describe('listing, falling back on ungh', () => {
	/** A source whose GitHub API and ungh answer as told, and the hosts it asked. */
	const hosts = (answers: Record<'api.github.com' | 'ungh.cc', () => Response>) => {
		const asked: string[] = [];
		const network = (async (input: RequestInfo | URL) => {
			const { hostname } = new URL(String(input));
			asked.push(hostname);
			return answers[hostname as keyof typeof answers]();
		}) as unknown as typeof fetch;
		return { source: new GitHubRepositorySource(ref, network), asked };
	};

	const tree = () => Response.json({ tree: [{ path, type: 'blob' }], truncated: false });
	const files = () => Response.json({ files: [{ path }] });
	const status = (code: number) => () => new Response(null, { status: code });
	const spent = () =>
		new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });

	it('asks GitHub first, and nobody else when it answers', async () => {
		const { source, asked } = hosts({ 'api.github.com': tree, 'ungh.cc': files });
		expect((await source.list()).entries).toEqual([{ path }]);
		expect(asked).toEqual(['api.github.com']);
	});

	it('asks ungh when the budget is spent', async () => {
		const { source, asked } = hosts({ 'api.github.com': spent, 'ungh.cc': files });
		expect((await source.list()).entries).toEqual([{ path }]);
		expect(asked).toEqual(['api.github.com', 'ungh.cc']);
	});

	it('does not ask ungh about a repository GitHub says is missing', async () => {
		const { source, asked } = hosts({ 'api.github.com': status(404), 'ungh.cc': files });
		await expect(source.list()).rejects.toMatchObject({ failure: 'not-found' });
		expect(asked).toEqual(['api.github.com']);
	});

	it("says what is missing in GitHub's words, whichever found it missing", async () => {
		const { source } = hosts({ 'api.github.com': status(500), 'ungh.cc': status(404) });
		await expect(source.list()).rejects.toThrow(
			'No repository owner/repo on github.com, or it is private.'
		);
	});

	it('reports a spent budget when neither answered, rather than the last failure', async () => {
		const { source } = hosts({ 'api.github.com': spent, 'ungh.cc': status(500) });
		await expect(source.list()).rejects.toMatchObject({ failure: 'rate-limited' });
	});

	it('reports the last failure when no budget was spent', async () => {
		const { source } = hosts({ 'api.github.com': status(500), 'ungh.cc': status(502) });
		await expect(source.list()).rejects.toThrow('ungh answered 502.');
	});

	it('says the hour is spent only when GitHub says none are left', async () => {
		const hour = hosts({ 'api.github.com': spent, 'ungh.cc': status(500) });
		await expect(hour.source.list()).rejects.toThrow(/has used them all/);
		const tooOften = hosts({ 'api.github.com': status(429), 'ungh.cc': status(500) });
		await expect(tooOften.source.list()).rejects.toThrow(/for asking too often/);
	});
});
