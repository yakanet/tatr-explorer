import { describe, expect, it } from 'vitest';
import cliCases from '../../../tests/fixtures/tql-cli-cases.json' with { type: 'json' };
import tasks from '../../../tests/fixtures/tsoding-tatr.json' with { type: 'json' };
import { compile } from './query.ts';

/**
 * Differential test against the reference implementation.
 *
 * `tests/fixtures/tql-cli-cases.json` holds the output of the real `tatr ls`
 * binary, built from tsoding/tatr and run over its own `tasks/` folder, the
 * same folder captured in `tsoding-tatr.json`. Every case below re-runs that
 * query through this library and asserts it selects exactly the same task ids,
 * so a divergence from the C implementation fails the suite.
 *
 * To regenerate: `pnpm run fixtures`, with the checkout at `../tatr` built.
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
			// `tatr ls` shows open tasks unless -c is passed; the query runs on top.
			const selected = tasks
				.filter((task) => (closed ? task.status === 'CLOSED' : task.status !== 'CLOSED'))
				.filter((task) => matches(task))
				.map((task) => task.id)
				.sort();

			expect(selected.join(',')).toBe(ids);
		}
	);
});
