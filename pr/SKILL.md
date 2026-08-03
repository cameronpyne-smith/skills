---
name: pr
description: Ship the current work as a pull request — branch off latest main with the given branch name, commit everything, push, create the PR, then wait for Copilot's automatic review and chain into the pr-comments skill to action it. Use when the user wants to turn the working tree into a PR. Invoke with /pr <branch-name>, e.g. /pr fix-token, or just /pr to ship the branch you are already on.
---

You ship the working tree as a pull request: branch, commit, push, create the PR, then wait for GitHub Copilot's automatic review and hand off to the **`pr-comments` skill** (this skill depends on it; they ship together). You act through the GitHub CLI (`gh`) and `git`, posting **as the authenticated user**.

This skill works in any agent that has `gh` and `git` (Claude Code, Copilot CLI). Drive everything through shell commands; do not assume agent-specific tooling.

## Prime directives

1. **Invocation is the approval.** There is no gate before pushing or creating the PR. Instead, narrate the plan as you go — branch name, commit message, PR title/body — in chat, so the user can interrupt. Do not pause to ask "shall I proceed?".
2. **The tree is all-in.** Everything *tracked* in the working tree belongs in this PR — that is the invocation contract. Untracked files are the exception: include ones that are clearly part of the work; flag anything that looks like junk (logs, scratch output, editor droppings) and leave it out rather than silently committing it.
3. **Stop, don't improvise.** Any git failure caused by conflicting or dirty state (checkout refused, non-fast-forward push) → stop and report exactly what failed. Never stash, force, or reset to work around it. The one exception: conflicts from Phase 3's merge of origin/main are resolved, not reported.
4. **One pass through review.** After chaining into pr-comments, you are done. If Copilot re-reviews the fix commits, do not chase it — the user re-invokes `/pr-comments` if they want another round.

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

**Then resolve `TICKET`.** All tickets live in **remundo-xml/Remundo.Ui.Platform** regardless of which repo the code is in, and the branch number is the ticket number. Take the leading digits of `BRANCH` when they run to **4+ digits** and are followed by `-` or the end of the name — `10718` → 10718, `10709-1` → 10709, `10672-org-fees-zeroed-on-save` → 10672, while `2fa-setup` and `fix-lockfile-drift` yield nothing. Confirm it exists: `gh issue view <n> --repo remundo-xml/Remundo.Ui.Platform --json number,title,state`. That call is the whole of the ticket's involvement — its title and body never feed the PR.

- **Resolves** → `TICKET` is set. Name it in chat, and say so if it is already `CLOSED` (usually the sign of a mistyped branch number).
- **No number in the branch name, or the number is not an issue there** → `TICKET` is unset. Say which in chat ("branch `fix-lockfile-drift` — no ticket number" / "10781 is not an issue in Platform") and carry on. A missing ticket never blocks the PR.

## Phase 2 — Commit

Skip if the tree is clean (re-run case — the work may already be committed).

1. Stage the specific paths — every tracked change, plus untracked files that are clearly part of the work. **Never `git add -A` / `git commit -am`.** List any untracked files you left out.
2. **One commit for the whole tree.** Subject: imperative summary of the work, derived from the conversation context. No body needed unless the change genuinely warrants one. **No AI co-author trailer, and no ticket reference** — the ticket is linked from the PR body alone.

## Phase 3 — Push and PR

1. `git merge origin/main`. Resolve any conflicts — keep both main's changes and this branch's intent — and complete the merge commit.
2. State the intended PR title and body in chat, then `git push -u origin BRANCH`.
3. **Check for an existing open PR** — `gh pr view BRANCH --json number,url,state,body` (or `gh pr list --head BRANCH`). This is the idempotency point:
   - **No PR** → `gh pr create --base main --title "<commit subject>" --body "<body>"`. The PR is **ready, not draft** — Copilot's auto-review skips drafts. The **title never carries the ticket number**; the `## Ticket` section is the only place it appears. Body is concise:
     ```
     ## Summary
     <what changed and why, a few lines>

     ## Test plan
     <how it was / can be verified>

     ## Ticket
     remundo-xml/Remundo.Ui.Platform#<TICKET>
     ```
     Omit the `## Ticket` section entirely when `TICKET` is unset. Use the bare `#<TICKET>` form when the PR is itself in Remundo.Ui.Platform. **Never a closing keyword** (`Closes`/`Fixes`) — one ticket often spans companion PRs in other repos, so it is closed by hand once the whole story lands, not by whichever PR merges first.
   - **Open PR already exists** (re-run, follow-up changes, or a previous run died between push and create) → do **not** create a duplicate. If this run pushed new commits, **update the PR body** (`gh pr edit`) so the Summary reflects the new changes, then continue to Phase 4. The `## Ticket` section belongs to creation only: never add one to an existing PR, and never disturb one already there.
4. If the push succeeds but `gh pr create` fails, stop and report — a re-run will detect the pushed branch and skip ahead to PR creation.

## Phase 4 — Wait for Copilot, then chain

Copilot reviews the PR automatically; there is no completion event, so poll.

1. Poll every **~45 seconds**, up to **10 minutes**, for a completed review authored by the Copilot bot:
   ```
   gh api repos/OWNER/REPO/pulls/NUMBER/reviews --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | {state, submitted_at}'
   ```
   (If the login differs, match any review whose author is a Bot with "copilot" in the login.) On a re-run, only count reviews submitted **after this run's push** — earlier reviews were for old code. If this run pushed nothing (resume case), accept the **latest completed review of the current head commit** instead.
2. Outcomes:
   - **Review found, with comments** → invoke the **`pr-comments` skill** on this PR. Its own rules take over from here — including its approval gate before anything irreversible.
   - **Review found, zero comments** → report "Copilot reviewed — no comments" with the PR URL, and stop.
   - **Timeout** → report "PR created, but no Copilot review after 10 minutes — run `/pr-comments` later" with the PR URL, and stop. Do not keep waiting.
3. **One pass only** (prime directive 4): after pr-comments finishes — even if its pushed fixes trigger a fresh Copilot review — this skill does not loop back to waiting.

## Rules

- Act as the authenticated user; everything posts under their name.
- Branch name comes from the argument, or the current branch when omitted (never main); base is always `origin/main`.
- The branch number is the ticket number, and tickets always live in `remundo-xml/Remundo.Ui.Platform`. Link it in a `## Ticket` section at creation — reference only, never a closing keyword, never in the title or the commit. No number, or no such issue → no section, and say so in chat.
- Never `git add -A`/`-am`; never stash, force-push, or reset to recover from a git failure — stop and report instead.
- Re-runs must be safe: reuse the branch, skip the commit if clean, never duplicate the PR, update the PR body when new commits were pushed.
- End every run with the PR URL and a one-line status (created / updated / reviewed clean / chained to pr-comments / timed out), and open the PR in the browser: `gh pr view NUMBER --web` (once per run, at the end).
