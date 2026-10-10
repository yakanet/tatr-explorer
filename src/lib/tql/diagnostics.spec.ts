import { describe, expect, it } from 'vitest';
import cliErrors from '../../../tests/fixtures/tatr-query-errors.json' with { type: 'json' };
import { compile, formatDiagnostic, parseWithWarnings, TqlError } from './query.ts';

/**
 * Differential test of the diagnostics, the counterpart to
 * `tql.conformance.spec.ts`.
 *
 * That suite replays which tasks a valid query returns. This one replays what an
 * invalid query *prints*: `tatr-query-errors.json` holds the complete stderr the
 * compiled binary produced for each case (the help block, the source, the caret
 * line and the message), and `formatDiagnostic` is compared against it whole.
 *
 * The gap this closes was measured rather than imagined. Five divergences lived
 * in here unnoticed while every valid query matched: three messages worded
 * differently, a full stop dropped from `Expected `]`.`, a lowercase `empty tag`
 * capitalised, a truncated deprecation warning, and a caret drawn as a run of
 * `^` where the C prints exactly one.
 *
 * Two differences are deliberate and normalised away below rather than hidden.
 *
 * To regenerate: `pnpm run fixtures`, with the checkout at `../tatr` built.
 */
interface ErrorCase {
	query: string;
	/** 1 for a failure, 0 for a query that only warns. */
	exit: number;
	stderr: string;
}

const cases = cliErrors as ErrorCase[];

/**
 * The CLI's message line carries an `ERROR: ` or `WARNING: ` prefix, which
 * separates a message from ordinary output on a terminal. On screen the
 * diagnostic has a panel of its own, so the prefix is not reproduced.
 */
const unprefixed = (stderr: string) => stderr.replace(/^(ERROR|WARNING): /m, '');

/**
 * The primary list gains two `~` lines, the honest consequence of adding the
 * primary (see the divergence noted in `query.ts`). Dropping them here compares
 * everything else exactly.
 */
const withoutTilde = (rendered: string) =>
	rendered
		.split('\n')
		.filter((line) => !line.startsWith('    ~'))
		.join('\n');

/** What the viewer would draw for a query, error or warning alike. */
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
