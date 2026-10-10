# An ill-typed query takes the page down

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: ui,tql

Reported as "Enter in the completion menu validates the page instead of
inserting the selected item", after typing `pr` and accepting `priority`.

---

Enter was innocent: it inserted `priority` correctly, and the URL proved it. The
page had already crashed while `pr` was being typed, so what looked like a
form submission was the error page replacing the list.

The language is typed, but the checks run during *evaluation*, not parsing.
`priority` parses and compiles cleanly (it is simply an integer where a boolean
is required), so `compile()` returned a matcher and the `TqlError` was thrown by
`match(task)` inside `apply()`, outside the try/catch that guards compilation,
in the middle of rendering. Same for a bare `100`.

Fixed by evaluating the compiled query once against a witness task while
compiling, so a type error lands in `query.error` beside the syntax errors and
is drawn as a diagnostic instead of thrown at the renderer. One witness is
enough: `and` and `or` evaluate both sides before testing either, exactly as the
C implementation does, so no branch can hide behind a short circuit that never
happens.

The bug predates completion: typing `priority` by hand did the same. Offering
the keyword just made it a keystroke away.

`QueryState` now has its own tests, which is the first thing 20260906-232421
asks for.
