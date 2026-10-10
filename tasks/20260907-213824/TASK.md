# A failed refresh keeps the reading it could not replace

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: ui,data

Found by asking a different question: with everything cached in IndexedDB, are
ungh and jsDelivr still needed? They are, and for a reason that turned out to be
half a defect.

The cache serves a repository already read; the mirrors serve one that has not
been. Two cases where the cache has nothing to offer:

- **A first visit with the budget already spent.** GitHub's sixty an hour are
  shared per IP address, so a reader behind a corporate NAT can arrive at zero
  without ever having opened this site. No cache entry, no token, no server:
  without a mirror, an error and nothing to do about it.
- **A refresh with the budget spent**, which is where the defect was: a failed
  load set `phase = 'failed'`, so the reading on screen was replaced by the
  failure panel. Pressing Refresh could therefore *cost* a reader the copy they
  were reading.

The second is now fixed rather than covered by a mirror. `refreshFailure` sits
beside `failure` and says the opposite thing: that one means there is nothing to
show, this one means what is on screen is the last reading and still true. The
header prints one clause, `not refreshed: GitHub API rate limit reached`,
where a panel used to take the page.

The comparison goes back with the reading it belongs to. `previous` is cleared
before every load on purpose, so that moving to another repository cannot
announce the last one's news; a kept reading has to put it back, or its badges
vanish for a reason the reader has no way to see.

Tested against a real source rather than a mocked loader, which this project had
no pattern for: an open folder whose grant is gone throws exactly as a spent
budget does, and that is what every reload of a local repository produces. Four
tests, each proved to bite: never keeping the reading fails three, dropping the
comparison fails one, and keeping *every* failure fails the one that pins a
first load still being fatal.

The README was wrong about this and is now precise. It claimed the webfont
stylesheet was "the only third-party request left anywhere", fifteen lines after
announcing a fallback to two mirrors. Both mirrors are now named, with what they
carry (a repository name) and when they are asked (only once the budget is
spent).

What is left for whoever revisits it: jsDelivr's remaining job is a first visit,
budget spent, with ungh also down. And it serves a copy measured at 63 tasks of
64. Worth rejudging against 53 lines and one third party, but not today.

---

jsDelivr is gone, judged rather than kept: two third parties for one case is
more machinery than a viewer of task folders needs. Its remaining job would
have been a first visit, with the budget spent, and ungh also down, answered
with a copy measured at 63 tasks of 64.

What its removal exposed is worth more than the 53 lines. **`mayBeStale` can no
longer be true**: the API lister, ungh and a folder all answer false, so the
field and the header clause that prints it (`· ungh may be behind`) are
waiting for a lister that does not exist. And that clause is the only reader
`Listing.source` has, so "which one answered" goes quiet with it.

Left in place, with the state of affairs written where each is declared, because
removing the pair is a decision about what the page promises rather than
cleanup. It also depends on a bigger one: ungh going too would leave a single
lister, and with it `Provider`, `PROVIDERS` and the fallback loop would all have
nothing left to do.

---

The pair is out: `Listing.source`, `Listing.mayBeStale`, the two fields they fed
in `LoadResult`, the two in the repository state, and the header clause that was
their only reader. A `Listing` is now entries and a branch.

Nothing on screen changed, which was the test of whether the removal was safe:
no lister could set staleness, so the clause could not render, so `source` was
never printed.

Provenance survives where it is actually useful. A *failure* still names the
lister that produced it, through `ProviderError`, and `forge.spec.ts` pins that
the forge, not whichever lister was asked last, is what refuses an unknown
host. It is success that had nobody to tell.

The fallback tests had to find another observable, and got a better one: they
spy on the providers instead of reading a name off the answer. That the second
lister *was asked* (or was not) is the actual claim, where a label was only
its shadow. Both directions were proved to bite: never falling through fails
one, asking everybody fails the other.

Left in place and flagged: `Provider.name` is now read by nothing. Removing it
means touching 28 call sites in one spec for a single line, and it is where the
interface says what a lister is, so it stays until someone would rather have the
line back than the churn.

