import { describe, expect, it, vi } from 'vitest';
import { parseRepoPath, servedRef } from '../../repo/ref.ts';
import { KINDS, openSource } from '../open.ts';

/**
 * A dev server serving a folder, which the rest of the suite runs without: the
 * constant is pasted in at compile time, so it is the one module reading it that
 * stands in for the server here.
 */
vi.mock('../../served.ts', () => ({ SERVED: 'my-project' }));

describe('a dev server that serves a folder', () => {
	it('makes `/served` an address', () => {
		expect(parseRepoPath('served')).toEqual(servedRef());
	});

	it('registers the source, named after the folder', () => {
		expect(KINDS.served?.id).toBe('served');
		expect(openSource(servedRef()).label).toBe('my-project');
	});

	it('leaves every reference to exactly one kind', () => {
		const refs = [servedRef(), parseRepoPath('local')!, parseRepoPath('owner/repo')!];
		for (const ref of refs) {
			expect(Object.values(KINDS).filter((kind) => kind.claims(ref))).toHaveLength(1);
		}
	});
});
