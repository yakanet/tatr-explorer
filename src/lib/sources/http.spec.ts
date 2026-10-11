import { describe, expect, it } from 'vitest';
import { readJson } from './http.ts';
import { SourceError } from './source.ts';

describe('an answer read as JSON', () => {
	it('is its body, parsed', async () => {
		expect(await readJson(Response.json({ tree: [] }), 'GitHub')).toEqual({ tree: [] });
	});

	it("is malformed when it does not parse, rather than in the parser's words", async () => {
		const answer = readJson(new Response('<html>'), 'GitHub');
		await expect(answer).rejects.toBeInstanceOf(SourceError);
		await expect(answer).rejects.toMatchObject({
			failure: 'malformed',
			message: 'GitHub answered with something that is not JSON.'
		});
	});
});
