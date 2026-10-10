# Dashboard driven by the TQL query

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: ui,tql

The query is global state and every chart is both a visualisation and a
control: clicking a tag bar appends `:bug` to the query, everything recomputes,
and the URL reflects it.

The format offers only four dimensions: binary status, numeric priority, tags,
creation date from the HUID. There are no closure dates, so burndown, cycle time
and "closed this month" are impossible. The activity chart plots creations split
by present status; anything else would be invented.

---

Needs the routing from 20260906-211206.

---

Done. The query is shared state held by the layout, so a tag clicked on a chart
filters the counts, the other charts, the top list and the list view at once,
and the navigation links carry it so a filtered view stays a shareable link.

The masthead is the part that makes this the designed dashboard rather than a
wall of counters: it states the repository's condition in a sentence. That
sentence is **computed**, not templated: `summarise` picks the one fact worth
leading with (a quiet stretch, an untagged majority, a repository gone silent,
how much is already done) and says nothing at all when none of them holds. On
tsoding/tatr it reads "23 tasks still open, and nothing was written in five of
the last ten months."

Charts show whatever priorities a repository actually uses rather than fixed
buckets, and the monthly series keeps its empty months, because in a repository
written in bursts the silence is the finding.
