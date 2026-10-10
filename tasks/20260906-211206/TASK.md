# Repository routing and its load states

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: ui

One unique URL per repository: `/{owner}/{name}`, with an optional forge host
prefix and an `@branch` suffix. Already implemented and tested in
`src/lib/repo/ref.ts`.

What is left is the loading, empty and error states: progressive loading (the
tree arrives before the files), rate-limit exhausted, no `tasks/` folder, and
unparsable task files listed rather than dropped.

---

Needs the data source from 20260906-211159.

---

Done. `src/lib/state/repository.svelte.ts` holds the loading state as runes, and
the route renders each phase and each failure explicitly rather than spinning.

Verified end to end in a browser against the live repository: tsoding/tatr loads
to 23 open / 41 closed / 64 total / 30 untagged, which matches what the CLI
reports. A reload shows "cached just now" without touching the network, and
sveltejs/svelte produces the "No tasks folder" state.

The two loading phases are shown separately on purpose: listing is the single
request that can be rate-limited, then the files stream in with a count. That
split is what lets the failure states say something useful instead of just
failing.
