# Completion offers tags inside a `~"..."` search

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: tql,ui

Typing `~"windows bu` offers `:bug`, and accepting it produces
`~"windows :bug `, a query that does not parse.

`complete` guards against this with `if (token[0] === '~') return null`, and the
guard cannot see the sigil: `tokenAt` stops at whitespace, so the token under
the caret is `bu` and the `~"` two words back is invisible to it.

The test that should have caught it passed for the wrong reason. It asserted
`complete('~"windows su', 12, TAGS)` was null, which it was, because `su`
matched no tag, not because the guard fired. An assertion that passes for an
unverified reason proves nothing, and this one sat exactly where a real test was
needed.

Fix by looking at the text before the caret rather than at the token alone: an
odd number of quotes means the caret is inside a phrase. Test it with a prefix
that *does* match a tag, which is the whole point.

---

Fixed by reading the text before the caret instead of the token alone: an
unclosed quote means the caret is still inside a phrase. Quotes only ever open a
search, so counting them is the whole test, and it holds however many words deep
the caret has gone.

The tests were rewritten to end on prefixes that **do** match a tag (`~"bu`,
`~"windows bu`, `~"windows support bu`, `:tql and ~"windows bu`, `~"de`), plus
two that check the menu comes back once the phrase is closed.

Then they were run against the old guard to make sure they could fail, which is
the part the first attempt skipped. Three of the five fail without the fix. The
other two pass either way, because in `~"bu` the token *is* `~"bu` and the old
`token[0] === '~'` catches it; the three that fall are the ones where the caret
sits on the second word or later, which is precisely the gap. So the cases cover
both paths rather than five copies of one.

Verified on screen too: nothing offered in `~"windows bu`, and `:bug` back as
soon as the phrase closes.
