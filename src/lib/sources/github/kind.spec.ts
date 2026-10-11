import { describe, expect, it } from 'vitest';
import { unreachable } from '#tests/support/network.ts';
import { GitHubRepository, githubKind } from './kind.ts';
import { parseRepoInput } from '../../repo/ref.ts';

const ref = parseRepoInput('owner/repo')!;
const path = 'tasks/20260304-115038/TASK.md';

/** Through the kind, which is how the application reaches these. */
const open = (repo = ref, branch?: string) => githubKind.open({ ...repo, branch });

/** GitHub answering every request with what `answer` makes, its mirror included. */
const answering = (answer: () => Response) =>
	new GitHubRepository(ref, { network: (async () => answer()) as unknown as typeof fetch });

describe('reading a file', () => {
	it('reads it from the CDN', async () => {
		const asked: string[] = [];
		const network = (async (url: RequestInfo | URL) => {
			asked.push(String(url));
			return new Response('# a task\n', { status: 200 });
		}) as unknown as typeof fetch;

		expect(await new GitHubRepository(ref, { network }).read(path)).toBe('# a task\n');
		expect(asked).toEqual([`https://raw.githubusercontent.com/owner/repo/HEAD/${path}`]);
	});

	it('answers null for a file the CDN refuses, rather than throwing', async () => {
		expect(await answering(() => new Response('nope', { status: 404 })).read(path)).toBeNull();
	});

	it('answers null when the network does not answer at all', async () => {
		// A read that throws would take the whole load down; one task that cannot
		// be read is listed as skipped instead.
		expect(await new GitHubRepository(ref, { network: unreachable }).read(path)).toBeNull();
	});
});

describe('the URL of a file', () => {
	it('reads it from the CDN that costs no budget', () => {
		expect(open().assetUrl(path)).toBe(
			'https://raw.githubusercontent.com/owner/repo/HEAD/tasks/20260304-115038/TASK.md'
		);
	});

	it('keeps the slashes of a branch that has them', () => {
		// `feature%2Fweb-ui` is a branch of that literal name, which nobody has, so
		// encoding the whole thing at once made every read of such a repository
		// fail.
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

	it('uses the host the repository was named with', () => {
		// The one URL that lives on the forge's own domain rather than on a CDN.
		const elsewhere = parseRepoInput('example.com/owner/name')!;
		expect(open(elsewhere).fileUrl(path)).toBe(`https://example.com/owner/name/blob/HEAD/${path}`);
	});

	it('keeps a branch with slashes, as the raw URL does', () => {
		expect(open(ref, 'feature/web-ui').fileUrl(path)).toContain('/blob/feature/web-ui/tasks/');
	});
});

describe('listing', () => {
	it('names a missing repository once, in the words of the forge', async () => {
		await expect(answering(() => new Response(null, { status: 404 })).list()).rejects.toThrow(
			'No repository owner/repo on github.com, or it is private.'
		);
	});

	it('calls an answer that is not JSON malformed, rather than quoting the parser', async () => {
		await expect(answering(() => new Response('<html>')).list()).rejects.toMatchObject({
			failure: 'malformed'
		});
	});

	it('says the hour is spent only when GitHub says none are left', async () => {
		const spent = () =>
			new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
		await expect(answering(spent).list()).rejects.toThrow(/has used them all/);

		const tooOften = () => new Response(null, { status: 429 });
		await expect(answering(tooOften).list()).rejects.toThrow(/for asking too often/);
	});
});
