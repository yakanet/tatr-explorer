# Test the views, not only the libraries

- STATUS: OPEN
- PRIORITY: 30
- TAGS: infra,ui

Every library is covered (two of the suites replay the compiled binary over the
64 tasks of tsoding/tatr), and not one test renders a component. The gap is
already anticipated in `vite.config.ts`, which excludes
`src/**/*.svelte.spec.ts` from the `server` project for a client project that
was never added.

What that costs is measured rather than theoretical. Three defects in the
dashboard and graph work were caught by a reader looking at the screen, never by
the suite: a stacked column rounded on the wrong end, a chart click landing on
closed tasks because the bars counted all of them, and arrowheads stopping short
of the node they point at.

Add the browser project and cover what a glance cannot assert on its own:

- a chart's click target carries the query the bar counted, and no more;
- one head per direction, two for a reciprocal citation;
- every failure state renders its own message, including `no-tasks-folder`,
  which needs a repository nobody wants to fetch in a test.

Deliberately low priority: half of what went wrong in the views was contrast,
alignment and proportion, which no assertion catches; a reader looking at the
screen found all of it faster. What tests would pin down is the other half, the
calculations still buried in components, so the first useful step is pulling
those out rather than reaching for a browser runner.
