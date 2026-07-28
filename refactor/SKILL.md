---
name: refactor
description: End-of-branch cleanup. /refactor [<fixed-point>] diffs the branch against a fixed point (default origin/main), finds session residue (dead code from abandoned approaches, duplicate helpers, naming drift, orphaned flags, leftover shims, stale tests) and refactoring opportunities in the changed code, applies the mechanical tier directly with one commit per refactor, and presents judgement calls for approval. Supersedes the built-in simplify skill for branch-level cleanup. Use at the end of a working session, or as a captain worker phase.
---

Behavior-preserving cleanup of a branch's changes. Two jobs, in order: remove the residue a working session leaves behind when direction changes mid-flight, then improve the shape of what remains. Never a feature change, never an optimization, never new test coverage — this skill **consumes tests; it never produces them**.

**Operator.** Findings that need approval go to your operator. In a manual session the operator is the user, present and asked directly. Under a captain worker, see "Under captain" at the end.

**Commits.** Invoking this skill *is* the authorization to commit — the global no-commit rule is lifted for the refactors this skill applies, on the current branch only. Conventions match the pr skill: stage specific paths, imperative subject, no AI co-author trailer. **Never push.**

## 1. Pin the scope

The fixed point is the argument if one was given, else `origin/main` (after `git fetch origin`). Confirm it resolves (`git rev-parse`) and the diff is non-empty: `git diff <fixed-point>...HEAD` (three-dot, against the merge-base).

The **actionable scope** — the only code this skill may change — is:

1. **The diff hunks** and the files they sit in.
2. **Symbols the diff stopped referencing.** For every call, import, or field access the diff deleted or renamed away, `git grep` the symbol it pointed at: zero remaining references → that symbol joins the scope as suspected dead code, and whatever *only it* referenced follows transitively. This is testing.md's C11 sweep run in reverse, and it is how residue in untouched files is found without unbounded crawling.

Where the repo already has dead-code tooling configured (Roslyn IDE0051/IDE0052 warnings, `knip`, `ts-prune`), run it and intersect its output with the scope — an accelerant, never the mechanism. Never act on a repo-wide finding outside the scope; a smell in untouched code is at most a report line.

## 2. Pass one — intuition

Read the full diff cold, **before opening either baseline file below**. The question is: *knowing where this ended up, how would I have written it?* Direction changes leave code shaped by its history rather than its purpose — look for what only makes sense if you know the detours, and for places a simpler construct does the same job. Record every finding; nothing here needs a smell name to count.

## 3. Pass two — baselines

Now read `../code-review/smells.md` (relative to this skill's directory) and `residue.md` (alongside this file), and sweep the scope against both. The baselines are a floor, not a ceiling: check at least these; anything else you notice is also a finding.

## 4. Tier every finding

**Mechanical → apply directly.** Behavior-preserving **and** introduces no new names: delete dead code, rename, inline a variable/function/middle-man, remove an unused parameter. Guard rails:

- Deleting or renaming anything **externally visible or serialized** — a public API member, a DTO/store/persisted-payload field, a DI-registered type, a config-bound property — first requires the C11-style reader sweep: enumerate every reader (`git grep`), classify each. The compiler does not see serializers, DI containers, or rehydrated localStorage payloads. Any reader found → not dead; drop the finding or move it to judgement.
- In a repo with **no automated test coverage**, deletes demote to judgement tier — the compiler is the only net there, and it isn't enough.
- **Stale-test deletion is always judgement tier.** Deciding a test is stale is an intent call, and it shrinks the safety net everything else in this skill leans on.

**Judgement → propose, act only on approval.** Anything that introduces a new name (extract function/class, introduce a type, restructure), stale-test deletion or rewrite, and coverage-demoted deletes. Present as a short list — finding, proposed refactor, risk — and wait for the operator's word per item.

**Report-only → never act.** Structural changes to uncovered code, optimization opportunities (no measured hotspot = churn), coverage gaps, and smells outside the actionable scope.

## 5. Apply

One refactor at a time: apply → build → run the test files covering the affected code → commit. A failed build or test means fix or revert *that refactor* before touching the next. One commit per refactor is the bisection net; a later squash-merge hides the noise.

## 6. Verify

Run the full suite **once**, at the end (in a captain worktree, the commands in testing.md's C2 table). A failure here → bisect via the checkpoint commits, revert the offender, note it. If the repo has no test suite, the build is the only net: the summary must say **"not verified against tests"** explicitly — never let silence imply coverage.

## 7. Report

- **Applied** — one line per refactor with its commit sha.
- **Awaiting approval** — the judgement list (manual session: ask now; captain: report-only).
- **Report-only** — findings noted, untouched, each with why.
- **Verification** — trimmed full-suite output, or the explicit no-coverage line.

## Under captain

When running inside a captain worker: judgement-tier findings are **report-only — never gate on them**; carry the full deferred list into the worker report so code-review re-flagging them reads as *deferred*, not *ignored*. The closing full-suite run doubles as the Evidence Block's C2 — don't run the suite twice. Deferred refactors can seed future tickets; leaving them is the correct bias for a minimal-change pipeline.

## Hard limits

- Never write new tests or add coverage — coverage gaps are findings, not work.
- Never optimize without a measured hotspot — report it instead.
- Never act outside the actionable scope; never reformat; no code comments.
- Behavior-preserving only: a change you can't argue preserves behavior is not a refactor — escalate it.
