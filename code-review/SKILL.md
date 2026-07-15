---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Bugs (is the changed code correct?) and Refactor (do the changes introduce code smells worth cleaning up?). Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between a fixed point the user supplies and `HEAD`:

- **Bugs** — is the changed code correct? Logic errors, unhandled edge cases, broken assumptions, error paths that swallow failures, concurrency hazards — anything that would misbehave at runtime.
- **Refactor** — do the changes introduce code smells worth cleaning up? Judged against the smell baseline below.

Run the axes sequentially — Bugs first, then Refactor — and keep their findings separate.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the commits: `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty.

### 2. Bugs axis

Read every hunk asking "under what inputs or state does this misbehave?" Read enough surrounding code to judge each hunk in context — the bug is often in the interaction between the change and code it didn't touch. Report per finding: file and hunk, what goes wrong, and the concrete scenario that triggers it. Order findings by severity. A suspected bug you can't fully confirm is still a finding — say what would confirm it.

### 3. Refactor axis

Match the diff against the smell baseline — a fixed set of Fowler code smells (_Refactoring_, ch. 3). Every smell is a labelled judgement call ("possible Feature Envy"), never a hard violation; skip anything tooling already enforces. Each reads *what it is* → *how to fix*:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the work doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Report

Present findings under `## Bugs` and `## Refactor` headings. Do **not** merge or rerank across axes. A clean axis is reported as clean — silence is not a verdict.

End with a one-line summary: findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes.

## Why two axes

A change can pass one axis and fail the other: correct code that deepens a smell, or beautifully-factored code that's wrong. Reporting them separately stops one from masking the other.
