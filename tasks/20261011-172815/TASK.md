# Split the largest pages into the blocks they show

- STATUS: CLOSED
- PRIORITY: 65
- TAGS: ui

The overview page is 574 lines, 341 of them styles; the task page 512 (268);
the graph page 511 (227). Each shows several blocks (the overview: its
summary, three charts, the `tatr ls` list) whose markup and styles sit far
apart in one file. A component per block, carrying its own markup and styles,
leaves the page as the assembly of what it shows.

Done when no page under `src/routes/` reads as several blocks at once, the
screens look the same, and the suite says the same as before.

---

Done for four pages, the landing page included, as the criterion covers every
page: each is now the assembly of its blocks, from 418 to 574 lines down to
between 53 and 133. A block used by one page sits beside it in `src/routes/`;
`src/lib/components/` keeps what several pages or a layout use. Nine screens
compare equal before and after, element by element (position, size and
computed style) at 1672 and 390 pixels wide, two renamed classes aside.

The first cut copied the rules several blocks shared, so the frames became
components: `ChartPanel` and `BarChart` for the overview's charts, `SidePanel`
for the task page's aside, `Jump` and `Glyph` for the references' "+N" and
arrows. The clickable tag went global in `labels.css`, and `.muted` joined
`.mono` there as a utility. Two computations left the components for `graph.ts`,
with specs: a card's link count, and a task's references, now read from the
graph's edges so the page counts the citations the cards draw. The addresses of
a task and of the list, built in five places, are `taskHref` and `listHref` in
`hrefs.ts`.
