# Move from the SvelteKit 3 release candidate to the stable release

- STATUS: OPEN
- PRIORITY: 80
- TAGS: infra

SvelteKit 3.0 shipped on 2026-10-01 (https://svelte.dev/blog/sveltekit-3-is-here)
and is at 3.0.1 now, with `@sveltejs/adapter-static` at 4.0.0. The lockfile
still holds `@sveltejs/kit` 3.0.0-next.25 and adapter-static 4.0.0-next.4. The
release candidate was chosen to learn this generation of the framework; the
stable release is the same generation, so staying on a prerelease no longer
buys anything.

The ranges in `package.json`, `^3.0.0-next.0` and `^4.0.0-next.4`, already
admit the stable releases: it is the lockfile that holds the old ones. Raise
them to `^3.0.1` and `^4.0.0`, so that no prerelease can come back. The two
packages move together, because next.27 reworked the API the framework hands
to adapters (`builder.generateServerInstance`).

`npx sv migrate sveltekit-3` is for a 2.x application. This one already has the
version 3 layout — `#lib` with file extensions, the config in `vite.config.ts`,
`resolve()` in place of `base` — so what is left is the bump, plus the
following.

**Two deprecated APIs in use, which `svelte-check` does not report.**

- `replaceState`, deprecated since next.13 in favour of
  `goto(url, { state, shallow: true, replace: true })`. The list and the board
  call it to keep the address in step with the query.
- `goto(…, { invalidateAll: true })` in the folder picker, deprecated in favour
  of `refreshAll`.

**Fixes since next.25 that touch what this site does**, to check on screen
rather than assume:

- next.29 blurs a focused SVG element before a navigation. The graph's nodes
  are SVG links, so keyboard focus after following one has to be tried.
- next.30 stops the focus reset from leaking a `hashchange`, and next.31 keeps
  scroll restoration manual after the back/forward cache. The graph's `+N`
  jumps to `#pivot-<id>`, and going back from them, should still land where
  they did.

The rest of the changelog between next.26 and 3.0.1 concerns remote functions,
forms, cookies and servers, none of which a static site uses. next.28 also
rejects query parameters starting with `x-sveltekit-`; this site uses none.

The README's stack table says "SvelteKit 3 (release candidate)", and has to say
what is installed.

Done when the lockfile holds the stable releases, no deprecated API is called,
`check`, the suite and a `BASE_PATH` build pass, and the graph's keyboard paths
and the list's and board's addresses have been tried in a browser.
