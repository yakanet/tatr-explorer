# Read a repository without burning the API rate limit

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: data

Measured on 2026-09-06:

- `codeload.github.com` refuses CORS, so downloading an archive is impossible
  from the browser.
- `api.github.com` allows CORS but is capped at 60 requests per hour per IP.
- `raw.githubusercontent.com` allows CORS and is not counted against that cap.

So: one API call to `git/trees/{branch}?recursive=1` for the whole tree, then
parallel raw fetches for the TASK.md blobs. On tsoding/tatr that is 30 KB total
for 64 tasks.

Cache the tree by ETag in localStorage; a 304 costs no quota. Fall back to
jsDelivr when the budget is spent: it can both list and serve, though its cache
lagged by one task when measured.

---

Needs the parser from 20260906-211152.

---

Done, in `src/lib/sources/`.

Went looking for a way around the 60/hour cap first. Findings:

- **Archives are impossible.** codeload answers
  `access-control-allow-origin: https://render.githubusercontent.com`, and
  `api.github.com/.../zipball` does send `*` but 302s straight to codeload, so
  the browser blocks the redirect target. Entering by a different door does not
  change where it lands. It would also be 400 kB to obtain 30 kB.
- **One request per repository, not two.** The trees API accepts `HEAD` as a
  reference, as does raw (verified on a repository whose default branch is
  `master`). So the default branch never has to be resolved.
- **raw is genuinely free.** No rate-limit headers at all, and 64 files fetched
  in parallel came back in 0.2 s.
- **ungh.cc** proxies the API with its own credentials, sends `*`, and returned
  the repository in full where jsDelivr was one task behind. It is the fallback
  when the budget is spent; jsDelivr is last and flags itself as stale.

The cache follows from a measurement that contradicts the usual assumption: an
unauthenticated conditional request answering 304 **still consumes quota**
(remaining went 59 → 58 → 57 across three identical `If-None-Match` calls).
Expiring the cache on a timer would therefore spend the reader's budget without
them asking, so entries never expire on their own: a repository is fetched once
and refreshed only on request, with the age of the view exposed for the refresh
control to show.
