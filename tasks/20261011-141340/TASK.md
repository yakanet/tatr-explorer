# Replace a reading in place, from the source that produced it

- STATUS: CLOSED
- PRIORITY: 48
- TAGS: data,ui

A reading is taken as one batch, and the code assumes it is the only one.
Refresh, following a local folder (20261010-030542) and writing to it
(20261010-030543) all come down to replacing the reading on screen with a newer
one, and today that replacement is a load from scratch. Three things follow,
each wrong on its own and each in the way of following a folder:

- **Refresh empties the screen.** `load()` goes back to `listing` whatever the
  reason, and every view renders only once the phase is `ready`, so the board
  unmounts and comes back without its scroll position, the text in the query
  bar or an open card. A blink on a forge; on every return from the editor, it
  would be the whole feature.
- **A local folder never shows what moved.** The previous reading is taken from
  IndexedDB, and a folder has no cache key, so a refreshed folder never gets a
  badge, while the reading it would compare against is right there on screen.
- **The source is opened again from the reference wherever one is needed**: the
  loader, the header (whether Refresh means anything), the task page (its body,
  its link to the forge) and the markdown renderer (attachments). It holds
  because a forge carries no state and the local folder keeps its own in module
  variables, and the header documents the place where it would break. A source
  that follows a folder holds a subscription and one that writes holds a
  permission; both belong to one instance.

What changes:

- The state tells the reading it shows from the one it is taking. A refresh
  over a standing reading leaves the phase at `ready` and the views mounted,
  says in the header that it is refreshing, and swaps the tasks only once the
  new reading is complete. A failure keeps the old one, as it already does.
- What moved is compared against the reading on screen, whatever the source.
  The cache stops deciding it and only keeps the comparison so that it survives
  a reload, which is the one thing a cache adds that memory does not have.
- The state opens the source once per reference and keeps it across refreshes.
  The loader reads a source instead of opening one, and the views ask the
  state's source for what only a source knows (whether it can be read again, a
  file's page, an attachment's URL) instead of reopening one.

Nothing else a reader can see changes. Following and writing come after, on top
of this.

Done when Refresh leaves the views mounted on both sources, a refreshed folder
shows its badges, and `openSource` has a single caller outside the tests.

---

Done. Refresh keeps the views mounted on both sources (the same row element,
the scroll position kept, the button saying `Refreshing…` meanwhile), and a
refreshed folder shows its badges. Checked on tsoding/tatr over a cache 33 days
old: 13 badges after the refresh, still there after a reload.

The state now has two entry points rather than a flag: `load(ref)`, from the
layout's effect, reads none of its own state and is the one place a source is
opened; `refresh()`, from a click, reads freely, and tries a failed reading
again from the source it already has. That removed the rule that every read
in `load` had to sit behind `refresh`, which had already cost a loading screen
that never ended. `openSource` throws `unsupported-host` itself and has one
caller, the state; the loader takes a source, and the renderer an `assetUrl`.

Two traps on the way:

- **The comparison, now taken in memory, went through the state's deep
  proxy.** Its `tags` arrays were proxies, which IndexedDB cannot clone, so
  every refresh of a forge would have failed on storing it. `tasks` and
  `previous` are raw now, being replaced whole. The suite cannot see it: its
  project compiles `$state` for the server, without proxies. The browser check
  above is what covers it.
- **A reread revoked the folder's `blob:` URLs** while a body that is no
  longer remounted kept linking to them. They are kept per path now while the
  file is unchanged (same size, same date), and revoked when it changes, the
  old snapshot being unreadable by then anyway, or when the folder closes.

Left as found: `RepositoryState.branch` had no reader left and is gone, which
leaves the loader's `branch` (and `readBranch` behind it) with no consumer.
The local source owning its folder outright belongs to 20261010-030542, where
a subscription first needs it.
