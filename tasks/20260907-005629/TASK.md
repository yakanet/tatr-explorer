# Bring the homepage up to its mockup

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: ui

The homepage is the one screen still built from nothing but a heading, an input
and a link. The mockup has more, and each piece of it earns its place:

- **The mark.** A small logo beside the wordmark, which every other view then
  inherits in the header. There is a `favicon.svg` already; the header shows
  bare text.
- **A search glyph in the field**, and the accepted forms said out loud beneath
  it: `owner/name`, a full URL, an SSH remote, `owner/name@branch`. The parser
  takes all four and nothing on screen admits it.
- **A card per repository under "TRY IT ON"**, with what it holds ("64 tasks,
  23 still open") rather than a bare link.
- **The line that sells the URL scheme**: every repository gets its own address,
  shown as `/tsoding/tatr?q=:bug`.

Where the cards come from is the interesting part. List the repositories already
in the cache, newest first, since a reader who has opened three is far more
likely to want a fourth visit than a first one. And the counts are already
stored, so a card costs no request at all. With an empty cache, fall back to
`tsoding/tatr`, which is the reference implementation and the one repository
certain to be worth showing.

That needs a way to enumerate the store, which `RepoStore` does not have today:
it can `read` and `write` a key and nothing else. IndexedDB can list keys, and
the in-memory store used by the tests will need the same method.

---

Done. The cards come from the cache, newest first: on this machine the page
opens on "tsoding/tatr: 64 tasks, 23 still open, read 6 minutes ago" and
"yakanet/tatr-dashboard: 12 tasks, 5 still open, read 2 hours ago". Nothing is
fetched to draw them; the counts were already stored.

`RepoStore` gained `list()`, which reads values and not only keys, because what
a card shows lives in them. That loads the whole cache: about 45 kB per
repository, from local storage, which is nothing against the request a card
would otherwise cost. A cache big enough for that to matter would want a
separate index of counts, and is not this.

`parseKey` is the piece worth having tested. `repoKey` writes
`host/owner/name@branch` with the branch left empty when there is none, and a
branch may itself contain slashes, so the split comes off the *first* `@`, not
the last segment. `feature/web-ui` survives it. A key that cannot be read back
is skipped rather than shown, since a card leading nowhere is worse than one
card fewer, and the fallback fires when every key is unreadable and not only
when there are none.

The heading changes with the source ("Already read" against the cache, "Try it
on" for the fallback) because "try it on" is a lie once the reader has been
there.

The mark is drawn rather than borrowed: `favicon.svg` was still the Svelte logo
from the scaffold. Three task lines and an open bullet, since the format is a
list of folders and an unfilled circle is how this viewer already draws a task
still open. It is a component, so it takes the accent from the theme and every
view's header carries it now.
