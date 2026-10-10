# Cross-reference graph

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: ui

Tasks cite each other by HUID. On tsoding/tatr that is 27 links across 30
tasks, with `20260310-133453` as the hub at 5 links.

This is upstream task 20260315-160715, which stalled on "the titles are usually
too big to fit in a nice compact picture". A browser graph solves exactly that:
short labels on the nodes, full title on selection and hover.

---

Reuses the detail view from 20260906-211220.

---

Done, at `/{owner}/{name}/graph`, and with no graph library: the reference CLI
turned out to already have a `graph` command, and reading it settled both the
behaviour and the shape of the screen.

`graph_run` writes a Graphviz digraph and renders it with `neato`. Its own
description in the source calls it "largely useless right now", and the numbers
say why. On tsoding/tatr the citations form **11 components whose largest holds
four tasks**, with 34 of the 64 tasks citing nobody and cited by nobody. A
force-directed canvas of that is a field of lonely bubbles, so the view is a
card per component instead. The drawing is placed exactly, a pair on a line and
the rest around a circle, which also means the same picture on every visit.

Nodes are numbered and the titles sit in a legend beneath. That is the whole
answer to what stalled upstream 20260315-160715, "the titles are usually too big
to fit in a nice compact picture": nothing has to fit in a node.

What the C source settled:

- **`NOTE(<huid>)` headings are journal timestamps, not references.** The CLI
  makes no distinction (it scans the file for anything id-shaped) and only
  keeps ids naming a folder that exists, which drops them on its own. 25 such ids
  in tsoding/tatr. So nothing here reports a broken link: the format has no such
  notion.
- **`chop_huid` has no word boundary.** `extractReferences` used `\b`, so an id
  glued to the preceding word was invisible to us and visible to the CLI. Ported
  as `scanHuids`, character by character like the original.

Covered by a third differential fixture: the 27 arrows the compiled `tatr graph`
wrote into its `.dot`, replayed field by field.

Our own repository then contradicted the layout immediately: it has a component
of **eight** tasks, all answering one. Hence the ring sized from the number of
satellites rather than fixed, and the busiest task in the middle. A repository
that is genuinely dense would want d3-force for its large components; nothing
seen so far does.

Nodes are links, so the drawing navigates on its own rather than being a picture
of the legend below it.

---

Reopened. A card per component stopped scaling: this repository's tasks now
form one component of 22, and a ring of 22 crossed by its chords is a drawing
nobody can read. The busiest task in the middle made it worse (every chord
passed behind it and read as one of its links), which is why the middle is now
kept for real stars only.

What is wanted instead: a card per pivot task, showing only the links into it
and out of it, a task free to appear in several cards. A card is then a star
by construction, whatever the repository.

---

Done, as a card per pivot. Each card draws one task in the middle and only
its own links round it: what cites it on the left, mutual citations over the
top, what it cites on the right, numbered against a list of titles beside the
drawing. A card is a star by construction, so no line crosses another however
dense the repository.

Pivots are chosen so each link is drawn once: the task with the most links
not yet drawn takes them all, the next takes what is left, ties going to the
older task (`starCards`, tested against tsoding/tatr: 15 cards, every one of
its 30 links exactly once). A link between two neighbours is drawn in one of
their cards; a neighbour that has a card of its own carries a `+N` leading
there, so the graph can be walked a star at a time. This repository comes out
at 13 cards of one to five links.

An arrow says its direction three ways: its head, its side of the drawing and
its colour (orchid into the pivot, mint out of it, grey both ways, the list's
glyphs matching). The first pair tried, orchid and sky, merged for a protan
reader (ΔE 4.6); orchid and mint stay apart for every colour-vision type, with
the dark theme's mint one step darker to keep it in the band an arrow needs.

Tried and dropped on the way, in a canvas of six mockups: the stars as three
columns of titles with CSS wires (readable, but a long page of full-width
cards), a compact list form, one drawing per group with focus on click, an
index of pivots, and arcs down a list of every task. How the tasks hang
together, which the cards no longer show at a glance, the masthead says in
words.
