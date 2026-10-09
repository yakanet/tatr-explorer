import { describe, expect, it } from 'vitest';
import { githubKind } from './kind.ts';
import { ListingError } from '../source.ts';
import { parseRepoInput } from '../../repo/ref.ts';

const ref = parseRepoInput('owner/repo')!;
const path = 'tasks/20260304-115038/TASK.md';

/** Through the contract, which is the only way the application reaches these. */
const open = (repo = ref, branch?: string) => githubKind.open(repo, branch ? { branch } : {});

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
		expect(open().fileUrl?.(path)).toBe(
			'https://github.com/owner/repo/blob/HEAD/tasks/20260304-115038/TASK.md'
		);
	});

	it('uses the host the repository was named with', () => {
		// The one URL that lives on the forge's own domain rather than on a CDN.
		const elsewhere = parseRepoInput('example.com/owner/name')!;
		expect(open(elsewhere).fileUrl?.(path)).toBe(
			`https://example.com/owner/name/blob/HEAD/${path}`
		);
	});

	it('keeps a branch with slashes, as the raw URL does', () => {
		expect(open(ref, 'feature/web-ui').fileUrl?.(path)).toContain('/blob/feature/web-ui/tasks/');
	});
});

describe('a host this forge does not serve', () => {
	// Asked once now, at the entrance of the fallback chain, so it is refused
	// before any lister is tried rather than by all three in turn.
	const elsewhere = parseRepoInput('gitlab.com/group/project')!;

	it('is refused as unsupported, without asking anybody', async () => {
		let asked = 0;
		const counting = async () => {
			asked += 1;
			throw new Error('should not be reached');
		};

		const failure = await githubKind
			.open(elsewhere, { listers: [counting] })
			.list()
			.catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(ListingError);
		expect((failure as ListingError).failure).toBe('unsupported-host');
		// The forge refusing, not whichever lister was asked last.
		expect((failure as ListingError).source).toBe('github');
		expect(asked).toBe(0);
	});
});
