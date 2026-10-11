import { describe, expect, it } from 'vitest';
import { iconify } from './icons.server.ts';

/** Calls the plugin's hooks as Vite does, with nothing on `this`. */
function hooks() {
	const plugin = iconify();
	const call = (hook: unknown, id: string) => (hook as (id: string) => unknown).call({}, id);
	return {
		resolve: (id: string) => call(plugin.resolveId, id),
		load: (id: string) => call(plugin.load, id) as string | undefined
	};
}

/** The icon a module exports, read back from its code. */
function exported(code: string | undefined): { viewBox: string; body: string } {
	return JSON.parse(code!.replace(/^export default /, '').replace(/;$/, ''));
}

describe('icons resolved at build time', () => {
	it('marks an icon import as virtual, and leaves any other id alone', () => {
		const { resolve } = hooks();
		expect(resolve('virtual:icons/lucide:bold.svg')).toBe('\0virtual:icons/lucide:bold.svg');
		expect(resolve('virtual:icons/lucide.svg')).toBeUndefined();
		expect(resolve('./bold.svg')).toBeUndefined();
	});

	it("loads one icon's viewBox and body from its set", () => {
		const icon = exported(hooks().load('\0virtual:icons/lucide:bold.svg'));
		expect(icon.viewBox).toBe('0 0 24 24');
		expect(icon.body).toMatch(/^<path [^>]*stroke="currentColor"/);
	});

	it('fails the build for an icon or a set that does not exist', () => {
		const { load } = hooks();
		expect(() => load('\0virtual:icons/lucide:no-such-icon.svg')).toThrow(
			'lucide has no icon "no-such-icon"'
		);
		expect(() => load('\0virtual:icons/no-such-set:bold.svg')).toThrow('@iconify-json/no-such-set');
	});

	it('loads nothing for an id it did not resolve', () => {
		expect(hooks().load('virtual:icons/lucide:bold.svg')).toBeUndefined();
	});
});
