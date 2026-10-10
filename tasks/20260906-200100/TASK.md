# Scaffold the SvelteKit 3 app and its deployment

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: infra

Scaffold with `sv@next create`, TypeScript, Vitest, adapter-static, and the
GitHub Pages workflow.

SvelteKit 3 is deliberate: the point is to learn that generation. Notable
differences from 2.x that this project hits: config moved into `vite.config.ts`,
`$lib` became `#lib` with mandatory file extensions, `tsconfig` extends
`$app/tsconfig`, and `base`/`assets` were removed from `$app/paths` in favour of
`resolve()`.

---

Done. `fallback: '404.html'` is what makes the deep routes work on Pages, and
`BASE_PATH` is injected by the workflow.

npm 10.9.3 crashes on this dependency tree inside arborist's `#loadPeerSet`;
pnpm resolves the same versions with zero peer warnings, so the project pins
pnpm. Also implemented the URL scheme in `src/lib/repo/ref.ts` with 24 tests:
one address per repository, `/{owner}/{name}` with an optional host prefix and
`@branch` suffix.
