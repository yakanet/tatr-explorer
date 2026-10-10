# Choose the branch from the header

- STATUS: CLOSED
- PRIORITY: 45
- TAGS: ui

A branch can be read already (`/{owner}/{name}@{branch}`, and the homepage
field accepts `owner/name@branch`), and the header shows the address branch and
all. But once a repository is open, nothing leads to another branch or back to
`HEAD`: the address bar is the only way.

The header could offer it where it names the repository: a field to type a
branch name, and a way back to `HEAD`. Typing rather than a list, because
listing a repository's branches is one more API request against the 60-an-hour
budget, spent before the reader has asked for anything.

Switching keeps the view and the query, as moving between views does, and a
branch that does not exist says so the way an unknown repository does.

Done when a branch can be named from the header and left again for `HEAD`,
without a request beyond the listing of the branch itself.

---

Done, as a menu under the address rather than a field in its place. Opened in
place, the field was wider than the address it replaced, and the views jumped
aside, onto two rows at 1100 px. The menu moves nothing.

The address is now a button (`b` from the keyboard) opening on a field and a
list. The list holds `HEAD` and the branches of this repository already in the
cache, as links, the one being read marked. Listing them reads local storage,
not GitHub. A note under them says any other costs one request. Typing `HEAD`
reads the default branch: git refuses it as a branch name, so nothing can hide
behind it.

A name git would refuse is turned down before any request, by
`isBranchName`, which follows `git check-ref-format`. It also refuses `#` and
`%`: git allows both, but our URL carries the branch raw and would cut it at
the first and decode the second. That refusal is a stopgap: encoding the branch
where URLs are built would lift it, and fix the homepage field, which accepts
`owner/name@branch` unchecked.

The view, task and query come along through `onBranch`, which resolves the
current route again with `repo` changed. One trap: the list and the board
rewrite their address through a shallow `goto`, which leaves `page.url` behind,
so a query typed there was lost. SvelteKit 3 keeps that address in
`page.shallow`, which `onBranch` reads first.

The menu's surface and rows became the global `.menu` beside `.panel`, shared
with the query's completions, and a refused field's red border moved to
`.input-pill` in `controls.css`. The cache gained `keys()`, so the menu learns
which branches are cached without loading every cached value.

A branch that does not exist gets the not-found panel, which now names the
branch. The listing answers 404 for a missing branch, a missing repository and
a private one alike, so the three are named together rather than told apart at
the cost of a second request. The panel gains "Read HEAD instead", same view
and query.

Checked in Chrome on this repository: `b`, a refused name, Escape back to the
address, `main` and back to `HEAD` from the list with `:ui` kept, `HEAD` typed
on a task page, a click outside, and `@no-such-branch`. The views stay at the
same x in every state, down to 390 px.
