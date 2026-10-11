import { describe, expect, it } from 'vitest';
import cliCases from '#tests/fixtures/tql-cli-cases.json' with { type: 'json' };
import tasks from '#tests/fixtures/tsoding-tatr.json' with { type: 'json' };
import { compile } from './query.ts';

/**
 * Compares query results with the reference implementation.
 *
 * `tests/fixtures/tql-cli-cases.json` holds what the real `tatr ls`, built from
 * tsoding/tatr, selected over its own `tasks/` folder (captured in
 * `tsoding-tatr.json`). Each case must select the same task ids here, so a
 * divergence from the C implementation fails the suite. `pnpm run fixtures`
 * regenerates it.
 */
interface CliCase {
	query: string;
	closed: boolean;
	ids: string;
}

describe('conformance with the tatr CLI', () => {
	it('exercises a real repository', () => {
		expect(tasks).toHaveLength(79);
		expect(cliCases.length).toBeGreaterThan(20);
	});

	it.each(cliCases as CliCase[])(
		'`tatr ls$closedFlag $query` selects the same tasks',
		({ query, closed, ids }) => {
			const matches = compile(query);
			const selected = tasks
				.filter((task) => (task.status === 'CLOSED') === closed)
				.filter((task) => matches(task))
				.map((task) => task.id)
				.sort();

			expect(selected.join(',')).toBe(ids);
		}
	);
});
