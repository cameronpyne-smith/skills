---
name: pr
description: Ship the current work as a pull request — branch off latest main with the given branch name, commit everything, push, create the PR, then loop Copilot review → pr-comments skill, re-requesting review after every round that pushed fixes, up to 3 reviews, then wait for CI and fix any check the branch broke. Use when the user wants to turn the working tree into a PR. Invoke with /pr <branch-name>, e.g. /pr fix-token, or just /pr to ship the branch you are already on.
---

You ship the working tree as a pull request: branch, commit, push, create the PR, then run a review loop — GitHub Copilot reviews, the **`pr-comments` skill** actions it (this skill depends on it; they ship together), and any fixes it pushes get re-reviewed. You act through the GitHub CLI (`gh`) and `git`, posting **as the authenticated user**.

This skill works in any agent that has `gh` and `git` (Claude Code, Copilot CLI). Drive everything through shell commands; do not assume agent-specific tooling.

## Prime directives

1. **Invocation is the approval.** There is no gate before pushing or creating the PR. Instead, narrate the plan as you go — branch name, commit message, PR title/body — in chat, so the user can interrupt. Do not pause to ask "shall I proceed?".
2. **The tree is all-in.** Everything *tracked* in the working tree belongs in this PR — that is the invocation contract. Untracked files are the exception: include ones that are clearly part of the work; flag anything that looks like junk (logs, scratch output, editor droppings) and leave it out rather than silently committing it.
3. **Stop, don't improvise.** Any git failure caused by conflicting or dirty state (checkout refused, non-fast-forward push) → stop and report exactly what failed. Never stash, force, or reset to work around it. The one exception: conflicts from Phase 3's merge of origin/main are resolved, not reported.
4. **Fixes get re-reviewed.** Any round whose pr-comments pass pushed commits gets a fresh Copilot review — fix commits are new, unreviewed code. Stop when a round pushes nothing, or after **3 reviews total**. Copilot's verdict (🟢/🟡/🔵) never drives the loop; it is reported, nothing more.
5. **Green before done.** The run is not finished until every required check on the head commit has passed or has been handed to the user. A failing check is work, not a footnote.

## Phase 0 — Preconditions (fail fast, in this order)

Stop with a clear message if any check fails.

1. **Branch name** — taken from the invocation (`/pr fix-token`). If omitted, use the **current branch** — unless that is main/master, in which case stop and ask for a name; never derive one.
2. **`gh` available and authenticated** — `gh auth status`. If not, stop.
3. **Something to ship** — `git status --porcelain` plus commits ahead of `origin/main`. If the tree is clean *and* nothing is ahead *and* no open PR exists for the branch, stop: there is nothing to do.

Capture `OWNER` and `REPO` (from `gh repo view --json owner,name`) for later commands.

## Phase 1 — Branch resolution

Let `BRANCH` be the argument, or the current branch if no argument was given. `git fetch origin` first, then:

- **Already on `BRANCH`** → use it as-is.
- **On another branch (typically main) and `BRANCH` does not exist** → `git checkout -b BRANCH origin/main`. Uncommitted changes carry over; local main is never touched or updated.
- **`BRANCH` exists locally or on the remote** → check it out (`git checkout BRANCH`). If the checkout is refused because of uncommitted changes → **stop and report** (prime directive 3).

## Phase 2 — Commit

Skip if the tree is clean (re-run case — the work may already be committed).

1. Stage the specific paths — every tracked change, plus untracked files that are clearly part of the work. **Never `git add -A` / `git commit -am`.** List any untracked files you left out.
2. **One commit for the whole tree.** Subject: imperative summary of the work, derived from the conversation context. No body needed unless the change genuinely warrants one. **No AI co-author trailer.**

## Phase 3 — Push and PR

1. `git merge origin/main`. Resolve any conflicts — keep both main's changes and this branch's intent — and complete the merge commit.
2. State the intended PR title and body in chat, then `git push -u origin BRANCH`.
3. **Check for an existing open PR** — `gh pr view BRANCH --json number,url,state,body` (or `gh pr list --head BRANCH`). This is the idempotency point:
   - **No PR** → `gh pr create --base main --title "<commit subject>" --body "<body>"`. The PR is **ready, not draft** — Copilot's auto-review skips drafts. Body is concise:
     ```
     ## Summary
     <what changed and why, a few lines>

     ## Test plan
     <how it was / can be verified>

     ## Ticket
     remundo-xml/Remundo.Ui.Platform#<the branch name's leading 4+ digit number — omit the section if it has none>
     ```
   - **Open PR already exists** (re-run, follow-up changes, or a previous run died between push and create) → do **not** create a duplicate. If this run pushed new commits, **update the PR body** (`gh pr edit`) so the Summary reflects the new changes, then continue to Phase 4.
4. If the push succeeds but `gh pr create` fails, stop and report — a re-run will detect the pushed branch and skip ahead to PR creation.

## Phase 4 — Review loop

At most **3 reviews total** (prime directive 4). A caller resuming mid-loop (e.g. a captain worker) continues at its recorded round; otherwise start at 1. How review 1 starts:

- **New PR** → Copilot reviews it automatically on creation; that is review 1.
- **Already-open PR with unhandled comments** — any unresolved review thread whose latest comment is not from your account, or a conversation comment you haven't replied to (pr-comments Phase 2's rule) → **action those before requesting anything.** The latest existing Copilot review is review 1: skip step 1 and run steps 2–4 on it. If there is no Copilot review yet (human comments only), run pr-comments first, then request review 1. Never request or wait for a new review while existing comments are unhandled.
- **Already-open PR, nothing unhandled** → if the latest Copilot review is of the current head, it is review 1; otherwise request one (`gh pr edit NUMBER --add-reviewer @copilot` — pushes don't reliably trigger one) and wait for it.

Every later review is requested explicitly.

Each round:

1. **Wait for the review.** There is no completion event, so poll every **~45 seconds**, up to **10 minutes**, for a Copilot bot review whose `commit_id` is the current head (`git rev-parse HEAD`):
   ```
   gh api repos/OWNER/REPO/pulls/NUMBER/reviews --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | {id, commit_id, submitted_at, body}'
   ```
   (If the login differs, match any review whose author is a Bot with "copilot" in the login.)
   - **Waiting on a push or request:** only count reviews submitted **after that push or request** — earlier reviews were for old code.
   - **Later reviews:** only count reviews submitted **after this round's request**. If the push also auto-triggered a review, the first matching review counts — one review per round, never two.
2. **Record the verdict** for the end report — display only, best-effort. The heading after `<!-- ccr-overview-v2 -->` (`### 🟢 Approval recommended` / `### 🟡 Changes recommended` / `### 🔵 Needs a closer look`) plus the sentence under it. If the format isn't there, leave it out. Never branch on it.
3. **Action it.** Invoke the **`pr-comments` skill** on this PR — always, even for a 🟢 or a review with zero inline comments; pr-comments decides what is actionable. Its rules apply: it auto-executes when nothing needs the user, and otherwise gates on the user's approval. A gated round is still part of the loop — once the user has decided and pr-comments has executed, continue to step 4.
4. **Decide.** `git fetch origin`, then compare the remote head (`git rev-parse origin/BRANCH`) with the round's review `commit_id` — this catches both pr-comments' fixes and any commits this run pushed after an existing review:
   - **Unchanged** → stop: the code on the PR is the code Copilot reviewed.
   - **Changed, fewer than 3 reviews so far** → request a fresh review with `gh pr edit NUMBER --add-reviewer @copilot`, and start the next round.
   - **Changed, 3 reviews reached** → stop, and report that the last round's fixes have not been reviewed by Copilot.
   - **pr-comments stopped on a failure** (e.g. push failed) → stop and report; its own end summary says what to do.
5. **Timeout** at step 1 → report "no Copilot review after 10 minutes — re-run `/pr` later" with the PR URL and the round reached, and stop. Do not keep waiting.

## Phase 5 — CI gate

Runs after the review loop ends for any reason except a git or pr-comments failure. At most **3 fix attempts**.

1. **Wait for checks on the current head** — `gh pr checks NUMBER --watch --fail-fast=false`, capped at 20 minutes. Checks can take a moment to register after a push ("no checks reported"); retry that for up to 2 minutes before concluding.
2. **All pass** → done; report the check list.
3. **Any fail** → for each failed check read the log: `gh run view <run-id> --log-failed`, or `gh run view <run-id> --job <job-id> --log` when the failing step writes its findings to a summary. Name the cause from the log, never from the check's name. Classify:
   - **Caused by this branch** — a test, build, lint, type-check or warning-ratchet failure that points at code this PR touches or at projects/files it adds → fix it as pr-comments' Phase 5 fixes a comment (local verification where the repo allows it, grill-me for non-trivial changes), commit with the check name in the subject, push, and go back to step 1.
   - **Not this branch** — also failing on main, runner/infra error, missing secret, a flaky test that passes on re-run → do not change code. Re-run once (`gh run rerun <run-id> --failed`), then report.
   - **Only an override would clear it** — a label such as `allow-new-warnings`, skipping a test, raising a threshold → **never apply it yourself.** Present the root-cause fix and the override as options and wait for the user.
4. **Re-review.** If this phase pushed commits and fewer than 3 Copilot reviews have run, return to Phase 4 for another round, then come back here. If the cap is reached, report that the CI fixes have not been reviewed by Copilot.
5. **3 attempts spent and still red** → stop and report each failing check with its log excerpt.

## Rules

- Act as the authenticated user; everything posts under their name.
- Branch name comes from the argument, or the current branch when omitted (never main); base is always `origin/main`.
- Never `git add -A`/`-am`; never stash, force-push, or reset to recover from a git failure — stop and report instead.
- Re-runs must be safe: reuse the branch, skip the commit if clean, never duplicate the PR, update the PR body when new commits were pushed.
- End every run with the PR URL, a one-line status (created / updated), and the review loop outcome: reviews run, why it stopped (clean round / 3-review cap / timeout / failure), and each round's recorded verdict line with what pr-comments did, and the final CI state: every check with pass/fail, what Phase 5 fixed, and anything left red with why. Then open the PR in the browser: `gh pr view NUMBER --web` (once per run, at the end).
