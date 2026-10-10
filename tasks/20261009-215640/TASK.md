# Read a repository already read, offline

- STATUS: OPEN
- PRIORITY: 40
- TAGS: infra

A repository's metadata already lives in IndexedDB and is only refreshed when
the reader asks, so a repository read once could be read again with no network
at all, if the site itself loaded. It does not: the shell, the scripts, the
stylesheet and the font come from GitHub Pages on every cold start.

A service worker keeping the build's own files would close that gap, and
SvelteKit 3 reworked how one is written: the `$service-worker` module is gone,
the lists of files come from `$app/manifest` (`immutable`, `assets`,
`prerendered`), the version from `$app/env`, paths from `resolve()`, and
registrations use `type: 'module'`. Learning that is half the point.

What the worker keeps is the build's own files and nothing else. Task bodies stay
out, as they stay out of IndexedDB: offline, a task's page says its text needs
the network rather than showing an empty body. That keeps "only metadata is
cached" true, here and for a body search (20261009-215641).

To decide before writing it:

- **Updates.** A worker serving the old build after a deploy is the classic
  trap. SvelteKit 3 checks for a new version on focus and every hour by default;
  the worker has to step aside when it finds one.
- **The base path and the fallback.** The site lives under the repository's
  name, and `404.html` is the shell every repository address is served from. Offline,
  the worker has to answer those addresses with that shell, or a deep link opens
  on the browser's own error page.

Offline, Refresh should say there is no network; what it keeps on screen is
already right (20260907-213824).

Done when a repository read once opens from a cold start with the network off
(dashboard, list, board and graph alike) and a deploy reaches a returning reader
within one visit.
