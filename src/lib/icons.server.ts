/**
 * A Vite plugin that resolves `virtual:icons/<set>:<name>.svg` to one icon of an
 * Iconify set, at build time: its `viewBox` and its SVG body. Only the icons
 * imported reach the bundle, and the page never asks the Iconify API, as the
 * site sends nothing anywhere.
 *
 * Each set comes from its own `@iconify-json/<set>` package rather than from
 * `@iconify/json`, which holds every set there is.
 */
import { createRequire } from 'node:module';
import { getIconData } from '@iconify/utils/lib/icon-set/get-icon';
import { iconToSVG } from '@iconify/utils/lib/svg/build';
import type { Plugin } from 'vite';

type IconSet = Parameters<typeof getIconData>[0];

const ICON = /^virtual:icons\/([^:/]+):(.+)\.svg$/;

export function iconify(): Plugin {
	// `require` parses a set's JSON once and keeps it for every later icon.
	const require = createRequire(import.meta.url);

	function setOf(name: string): IconSet {
		try {
			return require(`@iconify-json/${name}/icons.json`) as IconSet;
		} catch {
			throw new Error(`virtual:icons: no icon set "${name}", which @iconify-json/${name} holds.`);
		}
	}

	return {
		name: 'tatr-iconify',
		resolveId(id) {
			// The `\0` keeps other plugins from looking for the id on the disk.
			if (ICON.test(id)) return `\0${id}`;
		},
		load(id) {
			if (!id.startsWith('\0')) return;
			const match = ICON.exec(id.slice(1));
			if (!match) return;
			const [, setName, iconName] = match;
			const data = getIconData(setOf(setName), iconName);
			if (!data) throw new Error(`virtual:icons: ${setName} has no icon "${iconName}".`);
			// `iconToSVG` applies the offset, rotation and flips an icon may carry.
			const { attributes, body } = iconToSVG(data);
			return `export default ${JSON.stringify({ viewBox: attributes.viewBox, body })};`;
		}
	};
}
