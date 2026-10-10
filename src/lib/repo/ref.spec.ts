import { describe, expect, it } from 'vitest';
import {
	describeRef,
	formatRepoPath,
	isBranchName,
	isLocal,
	localRef,
	parseRepoInput,
	parseRepoPath,
	repoKey
} from './ref.ts';

describe('parseRepoPath', () => {
	it('defaults the host to github.com', () => {
		expect(parseRepoPath('owner/repo')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo'
		});
	});

	it('accepts an explicit forge host', () => {
		expect(parseRepoPath('gitlab.com/owner/repo')).toEqual({
			host: 'gitlab.com',
			owner: 'owner',
			name: 'repo'
		});
	});

	it('reads a branch from the @ suffix', () => {
		expect(parseRepoPath('owner/repo@dev')).toEqual({
			host: 'github.com',
			owner: 'owner',
			name: 'repo',
			branch: 'dev'
		});
	});

	it('keeps slashes inside branch names', () => {
		expect(parseRepoPath('owner/repo@feature/web-ui')?.branch).toBe('feature/web-ui');
	});

	it('tolerates surrounding slashes', () => {
		expect(parseRepoPath('/owner/repo/')?.name).toBe('repo');
	});

	it('allows dots in repository names, which are not hosts', () => {
		expect(parseRepoPath('sveltejs/svelte.dev')).toEqual({
			host: 'github.com',
			owner: 'sveltejs',
			name: 'svelte.dev'
		});
	});

	it.each(['', '/', 'owner', 'a/b/c', 'owner/', 'owner/re po'])('rejects %o', (input) => {
		expect(parseRepoPath(input)).toBeNull();
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
		const ref = parseRepoPath(path);
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

describe('repoKey', () => {
	it('separates the default branch from a named one', () => {
		const implicit = repoKey(parseRepoPath('owner/repo')!);
		const explicit = repoKey(parseRepoPath('owner/repo@main')!);
		expect(implicit).not.toBe(explicit);
	});
});

describe('a folder on this machine', () => {
	it('is what the one reserved segment means', () => {
		expect(parseRepoPath('local')).toEqual({ host: 'local', owner: '', name: '' });
		expect(isLocal(parseRepoPath('local')!)).toBe(true);
	});

	it('cannot be confused with a repository, which needs an owner too', () => {
		expect(parseRepoPath('local/repo')).toEqual({
			host: 'github.com',
			owner: 'local',
			name: 'repo'
		});
		expect(isLocal(parseRepoPath('local/repo')!)).toBe(false);
	});

	it('keeps the folder name out of the URL, which nobody else could follow', () => {
		expect(formatRepoPath(localRef('my-project'))).toBe('local');
	});

	it('reads on screen as the folder name, having no owner to qualify it', () => {
		expect(describeRef(localRef('my-project'))).toBe('my-project');
		expect(describeRef(localRef())).toBe('a folder on this machine');
		expect(describeRef(parseRepoPath('owner/repo')!)).toBe('owner/repo');
	});
});
