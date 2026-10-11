import { describe, expect, it, vi } from 'vitest';
import { SOURCES, openSource, parseRepoPath } from '../open.ts';
import { ServedSource } from './source.ts';

/**
 * A dev server serving a folder, which the rest of the suite runs without: the
 * constant is pasted in at compile time, so it is the one module reading it that
 * stands in for the server here.
 */
vi.mock('./enabled.ts', () => ({ SERVED: 'my-project' }));

describe('a dev server that serves a folder', () => {
	it('makes `/served` an address', () => {
		expect(parseRepoPath('served')).toEqual({ source: 'served', path: 'served' });
	});

	it('registers the source, named after the folder', () => {
		expect(SOURCES.served).toBe(ServedSource);
		expect(openSource(parseRepoPath('served')!).label).toBe('my-project');
	});

	it('leaves every reference to its own source', () => {
		expect(parseRepoPath('served')?.source).toBe('served');
		expect(parseRepoPath('local')?.source).toBe('local');
		expect(parseRepoPath('owner/repo')?.source).toBe('github');
	});
});
