import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { tatrServedFolder } from './src/lib/sources/served/folder.server.ts';

/**
 * The base path the site is served under, from `BASE_PATH`, which the deploy
 * workflow sets to the repository name. The custom domain, github.broutin.dev,
 * belongs to the account's user site, so GitHub serves each project under its
 * repository name there.
 */
function basePath(): '' | `/${string}` {
	if (process.argv.includes('dev')) return '';

	const value = process.env.BASE_PATH?.replace(/\/+$/, '');
	if (!value) return '';

	if (value.startsWith('/')) return value as `/${string}`;
	return `/${value}`;
}

/** Forces runes mode for the project, except for libraries. Can be removed in svelte 6. */
function runes({ filename }: { filename: string }): boolean | undefined {
	if (filename.split(/[/\\]/).includes('node_modules')) return undefined;
	return true;
}

export default defineConfig({
	plugins: [
		tatrServedFolder(),
		sveltekit({
			compilerOptions: { runes },
			// GitHub Pages serves `404.html` for any path without a file, which lets
			// client-side routing handle every path.
			adapter: adapter({ fallback: '404.html' }),
			paths: { base: basePath() }
		})
	],
	server: {
		watch: {
			// The repository's own tasks are data, not code: a save there must not
			// reload the page, which would take back the folder the reader opened.
			// Anchored at the root, so a `tasks` folder under `src/` is still watched.
			ignored: [fileURLToPath(new URL('./tasks/**', import.meta.url))]
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
