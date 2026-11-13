import { describe, expect, it } from 'vitest';
import { unreachable } from '#tests/support/network.ts';
import { memoryStore } from '../store.ts';
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

describe('a private repository, read with its token', () => {
	const kept = { value: 'github_pat_kept', login: 'someone' };
	const taskText = '# a task\n\n- STATUS: OPEN\n';

	interface Asked {
		url: string;
		authorization: string | null;
		accept: string | null;
	}

	/**
	 * A source whose GitHub answers as told, by the start of the path asked on
	 * `api.github.com`, with `token` kept for `owner/repo` and `neighbour` for
	 * another repository of the owner, and every request it was asked.
	 */
	const github = (
		answers: Record<string, () => Response>,
		{ token = kept as typeof kept | null, neighbour = null as typeof kept | null } = {}
	) => {
		const store = memoryStore();
		if (token) void store.keepToken('github.com/owner/repo@', token);
		if (neighbour) void store.keepToken('github.com/owner/other@', neighbour);
		void store.keepToken('github.com/stranger/repo@', kept);
		const asked: Asked[] = [];
		const network = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const headers = new Headers(init?.headers);
			asked.push({
				url: String(input),
				authorization: headers.get('authorization'),
				accept: headers.get('accept')
			});
			if (url.hostname !== 'api.github.com') return new Response(null, { status: 418 });
			const answer = Object.entries(answers).find(([start]) => url.pathname.startsWith(start));
			if (!answer) return new Response(null, { status: 404 });
			return answer[1]();
		}) as unknown as typeof fetch;
		return { source: new GitHubRepositorySource(ref, network, store), asked, store };
	};

	const tree = () => Response.json({ tree: [{ path, type: 'blob' }], truncated: false });
	const texts = () =>
		Response.json({
			data: {
				repository: {
					object: {
						entries: [
							{ name: 'tags', object: { text: 'bug, a bug\n' } },
							{
								name: '20260304-115038',
								object: {
									entries: [
										{ name: 'TASK.md', object: { text: taskText } },
										{ name: 'shot.png', object: { text: null, isBinary: true } }
									]
								}
							}
						]
					}
				}
			}
		});
	const user = () => Response.json({ login: 'someone' });
	const status = (code: number) => () => new Response(null, { status: code });
	const listing = { '/repos/owner/repo/git/trees/': tree, '/graphql': texts };

	it('lists it and reads its tasks along, in two requests to the API alone', async () => {
		const { source, asked } = github(listing);
		const { entries, texts } = await source.list();
		expect(entries).toEqual([{ path }]);
		expect(texts?.get(path)).toBe(taskText);
		expect(texts?.get('tasks/tags')).toBe('bug, a bug\n');
		expect(texts?.has('tasks/20260304-115038/shot.png')).toBe(false);
		expect(asked.map((one) => new URL(one.url).pathname).sort()).toEqual([
			'/graphql',
			'/repos/owner/repo/git/trees/HEAD'
		]);
		expect(asked.map((one) => one.authorization)).toEqual([
			'Bearer github_pat_kept',
			'Bearer github_pat_kept'
		]);
	});

	it('says what it costs: the token, not the CDN', async () => {
		const { source } = github(listing);
		await source.credential();
		expect(source.cost.listing).toBe('two requests');
	});

	it('reads a file the listing did not read along through the API, with the token', async () => {
		const { source, asked } = github({
			'/repos/owner/repo/contents/': () => new Response('a note\n')
		});
		expect(await source.read('tasks/20260304-115038/notes/a.md')).toBe('a note\n');
		expect(asked).toEqual([
			{
				url: 'https://api.github.com/repos/owner/repo/contents/tasks/20260304-115038/notes/a.md?ref=HEAD',
				authorization: 'Bearer github_pat_kept',
				accept: 'application/vnd.github.raw+json'
			}
		]);
	});

	it('never asks ungh, whatever GitHub answers', async () => {
		const { source, asked } = github({ '/repos/': status(500), '/graphql': status(500) });
		await expect(source.list()).rejects.toThrow('GitHub answered 500.');
		expect(asked.map((one) => new URL(one.url).hostname)).toEqual([
			'api.github.com',
			'api.github.com'
		]);
	});

	it('says whose token cannot see it when GitHub answers 404', async () => {
		const { source } = github({ '/repos/': status(404), '/graphql': texts });
		await expect(source.list()).rejects.toMatchObject({ failure: 'not-found' });
		await expect(source.list()).rejects.toThrow(/The token of someone cannot see owner\/repo/);
	});

	it('reports a token GitHub refuses as unauthorized', async () => {
		const { source } = github({ '/repos/': status(401), '/graphql': status(401) });
		await expect(source.list()).rejects.toMatchObject({ failure: 'unauthorized' });
	});

	it('reports a token that may not read the files as unauthorized, not as a spent budget', async () => {
		const { source } = github({ '/repos/': status(403), '/graphql': texts });
		await expect(source.list()).rejects.toThrow(/Contents: read-only/);
	});

	it('links a file through GitHub, which serves a private one to a reader signed in there', async () => {
		const { source } = github(listing);
		await source.credential();
		expect(source.assetUrl(path)).toBe(`https://github.com/owner/repo/raw/HEAD/${path}`);
	});

	it('sends no token for a repository it was not given one for', async () => {
		const { source, asked } = github({ '/repos/': tree }, { token: null });
		await source.list();
		expect(asked.map((one) => one.authorization)).toEqual([null]);
		expect(source.assetUrl(path)).toContain('raw.githubusercontent.com');
	});

	describe('given a token', () => {
		const verifying = { '/user': user, '/repos/owner/repo/git/trees/': tree };

		it('keeps one that reads the repository, under the account it belongs to', async () => {
			const { source, store } = github(verifying, { token: null });
			await source.authorize({ token: ' github_pat_new \n' });
			expect(await store.token('github.com/owner/repo@')).toEqual({
				value: 'github_pat_new',
				login: 'someone'
			});
			expect(await source.credential()).toEqual({ value: 'github_pat_new', login: 'someone' });
		});

		it('refuses one GitHub does not know, and keeps nothing', async () => {
			const { source, store } = github({ '/user': status(401) }, { token: null });
			await expect(source.authorize({ token: 'github_pat_bad' })).rejects.toThrow(
				/refused the token/
			);
			expect(await store.token('github.com/owner/repo@')).toBeNull();
		});

		it('refuses one that cannot see the repository, naming its account', async () => {
			const { source } = github({ '/user': user, '/repos/': status(404) }, { token: null });
			await expect(source.authorize({ token: 'github_pat_other' })).rejects.toThrow(
				'The token of someone cannot see owner/repo: tick the repository among those the ' +
					'token reads, on GitHub, or check its name.'
			);
		});

		it("offers the tokens of the owner's other repositories, and reads with one", async () => {
			const neighbour = { value: 'github_pat_neighbour', login: 'someone' };
			const { source, store } = github(verifying, { token: null, neighbour });
			expect(await source.neighbours()).toEqual(['other']);
			await source.authorize({ from: 'other' });
			expect((await store.token('github.com/owner/repo@'))?.value).toBe('github_pat_neighbour');
		});
	});

	it('fills in the page that creates a token to read this repository only', () => {
		const page = new URL(open().tokenPage);
		expect(page.origin + page.pathname).toBe(
			'https://github.com/settings/personal-access-tokens/new'
		);
		expect(Object.fromEntries(page.searchParams)).toMatchObject({
			name: 'tatr owner/repo',
			target_name: 'owner',
			expires_in: '90',
			contents: 'read'
		});
	});
});
