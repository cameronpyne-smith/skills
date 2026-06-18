---
name: pr-comments
description: Work through the open comments on the current branch's PR — classify each as a valid fix, a question to answer, an invalid comment to rebut, or one needing discussion; evaluate (don't blindly obey) and verify before acting; present a report for approval, then commit, push, reply, and resolve. Use when the user wants to action/respond to pull request review comments. Invoke with /pr-comments.
---

You process the review comments on a pull request: evaluate each one, fix the code where the comment is genuinely valid, push, and reply — or rebut comments that are wrong. You act through the GitHub CLI (`gh`) and `git`, posting **as the authenticated user**.

This skill works in any agent that has `gh` and `git` (Claude Code, Copilot CLI). Drive everything through shell commands; do not assume agent-specific tooling.

## Prime directives

1. **Evaluate, don't obey.** A reviewer — human or bot — can be wrong, working from stale context, or stating a preference as a defect. Never apply a change just because a comment asked for it. Confirm the assertion first (read the code, run a test, grep, check the spec). A "this comment is invalid" verdict must be backed by **concrete evidence**, never prose reasoning alone.
2. **When genuinely unsure, escalate to the user.** `needs-discussion` is the fallback for anything that isn't *clearly* a valid-with-an-obvious-fix or *clearly* invalid-with-evidence. Do not force a verdict to seem useful, and do not rubber-stamp comments as valid to avoid conflict.
3. **Nothing irreversible happens without explicit approval.** You prepare everything locally, present a report, and only push / reply / resolve after the user says go.

## Phase 0 — Preconditions (fail fast, in this order)

Stop with a clear message if any check fails. Do not continue or work around it.

1. **`gh` available and authenticated** — `gh auth status`. If not, stop.
2. **Resolve the PR from the current branch** — `gh pr view --json number,headRefName,url,baseRefName`. The user must already be **on the PR branch**; this skill never switches branches. If the current branch has no open PR (or more than one), stop and say so.
3. **Working tree must be clean** — `git status --porcelain`. If there is *any* output, **EXIT immediately** and tell the user to commit or stash their work first. It is the user's responsibility to clear the tree. Do not touch anything.
4. **Update the branch** — `git pull --ff-only`. If it cannot fast-forward (diverged), stop and let the user sort it out.

Capture `OWNER`, `REPO` (from `gh repo view --json owner,name` or the remote) and the PR `NUMBER` for the commands below.

## Phase 1 — Fetch all comments

Pull every comment surface:

- **Inline review threads** (carry the `resolved` state and thread IDs — only available via GraphQL):
  ```
  gh api graphql -f query='
  query($owner:String!,$repo:String!,$pr:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$pr){
        reviewThreads(first:100){
          nodes{
            id isResolved isOutdated
            comments(first:50){ nodes{ databaseId url body author{ login __typename } createdAt } } }
        }
      }
    }
  }' -F owner=OWNER -F repo=REPO -F pr=NUMBER
  ```
  `thread.id` is needed to resolve it. `isOutdated` flags stale anchors. `author.__typename == "Bot"` marks a bot.
- **Review summary bodies** — `gh api repos/OWNER/REPO/pulls/NUMBER/reviews` (the overall review message, e.g. a bot's overview).
- **Conversation/issue comments** — `gh api repos/OWNER/REPO/issues/NUMBER/comments` (these have **no resolved state** and cannot be resolved).

## Phase 2 — Decide what to process (idempotency)

For each thread/comment, skip it if **your account posted the latest reply** — it is already handled. If a reviewer has replied *after* your last reply, process it again from scratch. (A reply from your account counts as handled even if you wrote it by hand — that is intended.)

## Phase 3 — Pre-filter non-actionable comments

Route to **`no-action`** (record in the report, but never reply or resolve): praise/acknowledgement, CI/bot status noise, pure review summaries with nothing to act on, and your own past comments. Everything else goes to classification.

## Phase 4 — Classify (the decision tree)

Sort each remaining comment into exactly one action. The reviewer's identity sets the autonomy and the resolve behaviour later, but classification is the same for all.

- **`fix-and-reply`** — the comment identifies a genuine problem and there is an obvious, low-risk fix. (You verified the assertion is correct.)
- **`answer-and-reply`** — valid and worth a response, but needs **no code change** (e.g. a question, a request to explain a choice). Never invent a code change just to have something to reply with.
- **`rebut-and-reply`** — the comment is incorrect. **Requires concrete evidence** gathered now (a failing/passing test, a grep result, a spec/line reference) that disproves it. A *stale* comment (anchored to code that has since moved or no longer applies — often `isOutdated`) is a low-controversy sub-case of this.
- **`ask-user`** (fallback) — anything that does not clearly meet the bar for one of the above: genuine judgement calls, ambiguous requests, or where your confidence is low. **When in doubt, this is the answer.**

## Phase 5 — Prepare (local only — do NOT push or post yet)

**Fixes (`fix-and-reply`):**
1. Apply the change. It **may touch files outside the PR diff** if that is where the real fix lives — note any such change for the report.
2. **Objective floor — self-discovered verification.** Determine the project's build/type-check/test commands: prefer commands documented in the repo (`CLAUDE.md` / `AGENTS.md` / README), else infer from the manifest (`*.sln`/`*.csproj` → `dotnet build`/`dotnet test`; `package.json` → its test script; etc.). Run them. **If a relevant command fails, demote the fix to `ask-user`/flagged** — do not commit it. If no commands can be determined, don't block: note "no automated verification available" in the report.
3. **grill-me self-pass for non-trivial fixes.** A fix is *trivial* (skip the grill) only if it is mechanical and behaviour-preserving with a tiny surface — typo/rename/format, or a guard the comment explicitly specifies, in one file. **Anything touching logic, control flow, or multiple files gets grilled; when in doubt, grill.** Run the fix through the **`grill-me` skill** (this skill depends on it; they ship together): adversarially interrogate your own change — does it handle the edge cases? change behaviour elsewhere? is it the minimal change? does it address the root cause or just the symptom? — answering each with concrete evidence. **If any question can't be answered with evidence, demote the fix to flagged** and surface it to the user; do not commit it.
4. **Commit (do not push).** One commit per independent change. **Stage only the specific paths that fix touched** — never `git add -A` / `git commit -am`. Message: imperative summary, then a trailer referencing the comment(s) — usually 1:1, list all if 1:many:
   ```
   <imperative summary of the change>

   Addresses PR #<NUMBER> comment <databaseId>
   <comment url>
   ```
   No AI co-author trailer.

**Answers (`answer-and-reply`)** — draft the reply text.

**Rebuttals (`rebut-and-reply`)** — draft an evidence-backed reply (state the evidence, not just an opinion).

## Phase 6 — Report and get approval

Present a single report **in chat**, grouped by action:

- ✅ **Fixes** — per item: the comment, the commit subject, and *what you checked* (verification result + key grill findings); flag any out-of-diff changes.
- 💬 **Answers** — drafted replies.
- ⚠️ **Rebuttals** — drafted replies **with their evidence**.
- 🚩 **Needs-discussion / flagged** — including any fix demoted by verification or the grill.
- ⚪ **No-action** — one line each, so the user sees they were considered.

Keep it summary-first: describe each change, surface possible issues, and show code snippets only when small. Then:

1. **Resolve every `needs-discussion`/flagged item with the user first**, turning each into a concrete action — so the batch is complete before approval.
2. The user may **veto or adjust any individual item** ("skip the fix on #3", "reword rebuttal #2", "#5 is actually valid"). It is a conversation, not a yes/no.
3. **Do nothing irreversible until the user gives an explicit go** ("push" / "approve"). Default on anything ambiguous is **don't act**.

## Phase 7 — Execute (only after approval)

1. **Push** all commits in one go: `git push`. **If the push fails, STOP — post no replies and resolve nothing.** Report the failure; the user will fix the push and re-invoke (re-derive commit SHAs at that point, as a rebase/amend may have changed them).
2. **After a successful push**, process each handled comment — **continue on individual failures**, don't abort the batch:
   - **Reply.** Inline review-thread comment → reply in-thread:
     `gh api repos/OWNER/REPO/pulls/NUMBER/comments/<databaseId>/replies -f body="..."`. Conversation/issue comment (can't be threaded) → post a new conversation comment quoting/@-mentioning the author: `gh api repos/OWNER/REPO/issues/NUMBER/comments -f body="..."`.
     - Fix reply: "Fixed in `<sha>`." plus any note on the approach or a decision between options (low-risk documentation — no need to ask).
     - Answer reply: the answer.
     - Rebuttal reply: the evidence-backed explanation.
   - **Resolve** per this matrix (only **review threads** can be resolved — `resolveReviewThread`; issue comments never can):

     | reviewer | review thread | issue/conversation comment |
     |---|---|---|
     | **Bot** (`__typename == "Bot"`) | reply **+ resolve** (any verdict) | reply only — can't resolve |
     | **Human — valid + fixed** | reply **+ resolve** | reply only |
     | **Human — rebutted** | reply, **leave open** | reply, leave open |

     Resolve a thread with:
     ```
     gh api graphql -f query='mutation($t:ID!){ resolveReviewThread(input:{threadId:$t}){ thread{ isResolved } } }' -F t=<thread.id>
     ```
3. **End summary** — list what was replied/resolved and what errored. **Explicitly flag any comment that was replied to but NOT resolved** (e.g. a resolve API failure), with its URL — because the idempotency rule will skip it on re-run, so the user must resolve it manually: `replied but NOT resolved — resolve manually: <url>`.

## Rules

- Act as the authenticated user; everything posts under their name.
- Never push or post without an explicit go. Never `git add -A`/`-am`.
- Evaluate every comment; rebuttals need evidence; bias to `ask-user` when unsure.
- Require a clean working tree and the PR branch already checked out — fail fast otherwise.
- A failed build/test or a failed grill pulls a fix out of the autonomous lane into the report.
