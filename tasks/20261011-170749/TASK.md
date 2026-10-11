# A reference names the source that reads it

- STATUS: CLOSED
- PRIORITY: 40
- TAGS: data

`Address` answers three questions with one value: which source one of our URLs
is for, which source a reference is for, and which hosts are read at all. To
answer the second for a folder, a word such as `local` poses as a host in a
reference that otherwise describes a repository on a forge, with an empty owner
and name. And the second will not stay a deduction from the host: a repository
added by hand on a self-hosted forge (20261011-170750) is read by the source
the reader chose, which no host says.

So a reference carries its source, decided once, as one of our URLs is read:

- a forge's, `{ source, host, owner, name, branch? }`, its source being the one
  that reads the host, or none on a host nothing reads, for the page to say so;
- one of this site's own paths, `{ source, path }`, for a source no URL anyone
  else follows can reach: `/local`, `/served`.

Opening a source is then reading a field. What only formats a URL (the home
page's picker, the recent repositories, moving to another branch) keeps the
forge address alone, which has no source to name. `Address` keeps its two
shapes for now, its word becoming a `path`, which is what it is.

Done when no reference poses as a host, the registry opens a source by the one
the reference names, and the suite says the same as before.

---

Done as planned, the source typed by the registry's keys, so a reference holds
what the registry decided rather than a string to check again. Opening a source
looks it up by that key, and `sourceIdOf` went: the page reads `ref.source`.

The branch field and moving to another branch take a forge's reference, the
header narrowing it where the source has branches. The forge address alone
stays where there is no source to name: GitHub's own requests, cache keys, the
picker and the recent repositories. The task page names the forge a file's
page is on from that page's URL rather than from the reference.
