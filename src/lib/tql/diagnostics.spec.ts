import { describe, expect, it } from 'vitest';
import cliErrors from '#tests/fixtures/tatr-query-errors.json' with { type: 'json' };
import { compile, formatDiagnostic, parseWithWarnings, TqlError } from './query.ts';

/**
 * Compares the diagnostics with the reference implementation, as
 * `conformance.spec.ts` does for the tasks a valid query selects.
 *
 * `tatr-query-errors.json` holds the full stderr the compiled binary printed for
 * each case (help block, source, caret line, message), and `formatDiagnostic`
 * must reproduce it whole. Two deliberate differences are normalised away below.
 * `pnpm run fixtures` regenerates it.
 */
interface ErrorCase {
	query: string;
	/** 1 for a failure, 0 for a query that only warns. */
	exit: number;
	stderr: string;
}

const cases = cliErrors as ErrorCase[];

/** Strips the CLI's `ERROR: ` or `WARNING: ` prefix, which `formatDiagnostic` leaves off. */
const unprefixed = (stderr: string) => stderr.replace(/^(ERROR|WARNING): /m, '');

/** Drops the two `~` lines the viewer adds to the primary help, so the rest compares exactly. */
const withoutTilde = (rendered: string) =>
	rendered
		.split('\n')
		.filter((line) => !line.startsWith('    ~'))
		.join('\n');

/** Renders a query as the viewer would, error or warning alike. */
function render(query: string): string {
	try {
		compile(query);
		const { warnings } = parseWithWarnings(query);
		if (warnings.length === 0) return '';
		return withoutTilde(formatDiagnostic(query, warnings[0]));
	} catch (error) {
		if (!(error instanceof TqlError)) throw error;
		return withoutTilde(formatDiagnostic(query, error));
	}
}

describe('conformance with the tatr diagnostics', () => {
	it('covers every branch that reports something', () => {
		expect(cases).toHaveLength(15);
		expect(cases.filter((one) => one.exit === 0)).toHaveLength(1);
	});

	it.each(cases)('renders $query as the CLI does', ({ query, stderr }) => {
		expect(render(query)).toBe(unprefixed(stderr));
	});

	it('fails on every case the CLI fails on, and only those', () => {
		for (const { query, exit } of cases) {
			let threw = false;
			try {
				compile(query);
			} catch {
				threw = true;
			}
			expect(threw, query).toBe(exit === 1);
		}
	});
});
