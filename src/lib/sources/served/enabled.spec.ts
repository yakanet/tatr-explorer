import { describe, expect, it, vi } from 'vitest';
import { wordRef } from '../../repo/ref.ts';
import { KINDS, kindOf, openSource, parseRepoPath } from '../open.ts';

/**
 * A dev server serving a folder, which the rest of the suite runs without: the
 * constant is pasted in at compile time, so it is the one module reading it that
 * stands in for the server here.
 */
vi.mock('./enabled.ts', () => ({ SERVED: 'my-project' }));

describe('a dev server that serves a folder', () => {
	it('makes `/served` an address', () => {
		expect(parseRepoPath('served')).toEqual(wordRef('served'));
	});

	it('registers the source, named after the folder', () => {
		expect(KINDS.served?.id).toBe('served');
		expect(openSource(wordRef('served')).label).toBe('my-project');
	});

	it('leaves every reference to its own kind', () => {
		expect(kindOf(wordRef('served'))?.id).toBe('served');
		expect(kindOf(parseRepoPath('local')!)?.id).toBe('local');
		expect(kindOf(parseRepoPath('owner/repo')!)?.id).toBe('github');
	});
});
