import { describe, expect, it } from 'vitest';
import {
	formatRepoName,
	formatRepoPath,
	isBranchName,
	parseForgePath,
	parseRepoInput,
	repoKey,
	wordRef
} from './ref.ts';

describe('parseForgePath', () => {
	it('defaults the host to github.com', () => {
		expect(parseForgePath('owner/repo')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo'
		});
	});

	it('accepts an explicit forge host', () => {
		expect(parseForgePath('gitlab.com/owner/repo')).toEqual({
			host: 'gitlab.com',
			owner: 'owner',
			name: 'repo'
		});
	});

	it('reads a branch from the @ suffix', () => {
		expect(parseForgePath('owner/repo@dev')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo',
			branch: 'dev'
		});
	});

	it('keeps slashes inside branch names', () => {
		expect(parseForgePath('owner/repo@feature/web-ui')?.branch).toBe('feature/web-ui');
	});

	it('tolerates surrounding slashes', () => {
		expect(parseForgePath('/owner/repo/')?.name).toBe('repo');
	});

	it('allows dots in repository names, which are not hosts', () => {
		expect(parseForgePath('sveltejs/svelte.dev')).toEqual({
			host: 'github.com',
			owner: 'sveltejs',
			name: 'svelte.dev'
		});
	});

	it.each(['', '/', 'owner', 'a/b/c', 'owner/', 'owner/re po'])('rejects %o', (input) => {
		expect(parseForgePath(input)).toBeNull();
	});
});

describe('parseRepoInput', () => {
	it('accepts a browser URL', () => {
		expect(parseRepoInput('https://github.com/owner/repo')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo'
		});
	});

	it('takes the branch from a tree URL', () => {
		expect(parseRepoInput('https://github.com/owner/repo/tree/dev/tasks')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo',
			branch: 'dev'
		});
	});

	it('keeps only the first segment after tree, since the path is inseparable', () => {
		expect(parseRepoInput('https://github.com/owner/repo/tree/feature/web-ui')?.branch).toBe(
			'feature'
		);
	});

	it('accepts an SSH remote and strips the .git suffix', () => {
		expect(parseRepoInput('git@github.com:owner/repo.git')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo'
		});
	});

	it('accepts the bare shorthand', () => {
		expect(parseRepoInput('  owner/repo  ')?.owner).toBe('owner');
	});

	it('does not mistake a URL scheme for an SSH host', () => {
		expect(parseRepoInput('https://example.com')).toBeNull();
	});
});

describe('formatRepoPath', () => {
	it.each([
		['owner/repo'],
		['owner/repo@dev'],
		['gitlab.com/owner/repo'],
		['gitlab.com/owner/repo@feature/web-ui']
	])('round-trips %o', (path) => {
		const ref = parseForgePath(path);
		expect(ref).not.toBeNull();
		expect(formatRepoPath(ref!)).toBe(path);
	});

	it('omits the default host', () => {
		expect(formatRepoPath({ host: 'github.com', owner: 'a', name: 'b' })).toBe('a/b');
	});
});

describe('isBranchName', () => {
	it('accepts what a branch is usually called', () => {
		for (const name of ['main', 'dev', 'feature/web-ui', 'release-1.0', 'v2_fix', 'été']) {
			expect(isBranchName(name), name).toBe(true);
		}
	});

	it('refuses what git refuses', () => {
		const refused = [
			'',
			'@',
			'my branch',
			'tab\there',
			'a..b',
			'a//b',
			'/dev',
			'dev/',
			'dev.',
			'dev.lock',
			'.hidden',
			'feature/.hidden',
			'a@{1}',
			'a~1',
			'a^2',
			'a:b',
			'what?',
			'a*',
			'a[0]',
			'back\\slash'
		];
		for (const name of refused) expect(isBranchName(name), name).toBe(false);
	});

	it('refuses what git allows but our URL cannot carry', () => {
		expect(isBranchName('fix#12')).toBe(false);
		expect(isBranchName('100%')).toBe(false);
	});
});

describe('formatRepoName', () => {
	it('names a repository by owner and name, its host and branch aside', () => {
		expect(formatRepoName(parseForgePath('gitlab.com/group/project@dev')!)).toBe('group/project');
	});
});

describe('repoKey', () => {
	it('separates the default branch from a named one', () => {
		const implicit = repoKey(parseForgePath('owner/repo')!);
		const explicit = repoKey(parseForgePath('owner/repo@main')!);
		expect(implicit).not.toBe(explicit);
	});

	it('reads back as the forge path it is, branch and all', () => {
		// The recent repositories are cached under these keys, and listed from them.
		for (const path of ['owner/repo', 'owner/repo@dev', 'owner/repo@feature/web-ui']) {
			const ref = parseForgePath(path)!;
			expect(parseForgePath(repoKey(ref))).toEqual(ref);
		}
	});

	it('gives up on a key it cannot read', () => {
		expect(parseForgePath('nonsense')).toBeNull();
		expect(parseForgePath('')).toBeNull();
	});
});

describe('a word for an address', () => {
	it('is never a forge address, which needs an owner too', () => {
		expect(parseForgePath('local')).toBeNull();
		expect(parseForgePath('local/repo')).toEqual({
			host: 'github.com',
			owner: 'local',
			name: 'repo'
		});
	});

	it('is the whole of the URL, a name in it reading as an address nobody can follow', () => {
		expect(formatRepoPath({ ...wordRef('local'), name: 'my-project' })).toBe('local');
	});
});
