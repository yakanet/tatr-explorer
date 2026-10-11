import { describe, expect, it, vi } from 'vitest';
import { SOURCES, openSource, parseRepoPath } from '../open.ts';
import { ServedSource } from './source.ts';

/** Stands in for a dev server serving `my-project`, which the rest of the suite runs without. */
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
