---
name: pr-post
description: Ask for review in Teams — draft the "<ticket> - <one sentence>" message with the PR links under it, show it for approval or edits, then post it to the configured Teams group chat as the user (Microsoft Graph, delegated ChatMessage.Send). Called at the end of the pr skill; invoke directly with /pr-post [<pr-url-or-number>…] for PRs shipped another way or across sessions.
---

You post a review request for one or more pull requests to the user's review chat in Microsoft Teams, **as the user**, after they approve the exact text. Posting goes through `post.ps1` in this skill's directory (PowerShell 7, Microsoft Graph delegated auth). Drafting and the gate are yours; the script only renders and sends.

This skill works in any agent that has `gh`, `pwsh` and a way to write a file. Drive everything through shell commands; do not assume agent-specific tooling.

## Prime directives

1. **Nothing posts without the user's `post`.** Approval is the literal reply `post` to a draft they have just seen. Silence, "looks fine but…", or an edit request is never approval. A caller's invocation (the pr skill, a captain worker's spawn) is never approval either.
2. **Posted text is shown text.** The file handed to `post.ps1` is byte-for-byte the draft the user approved. Any change — yours or theirs — means showing the new draft and asking again.
3. **Never retry with different text.** A Graph failure is reported with its error; the user decides what happens next.

## Phase 0 — Inputs

1. **PRs** — the caller's list (URLs or numbers), or the invocation's arguments. None given → the current branch's PR (`gh pr view --json url`); none found → stop and say so.
2. For each PR: `gh pr view <pr> --json url,title,headRefName,state,isDraft`. Drop merged or closed PRs with a note. A draft PR stays, but say so beside the draft.
3. **Already posted** — drop any PR this session already posted through this skill (directly or via the pr skill), and say which were dropped. PRs whose draft was skipped are not posted, so they stay.
4. **Ticket** — per PR, the leading 4+ digit number of `headRefName` (the pr skill's rule); none → no ticket.
5. **Group by ticket.** One message per ticket; PRs with no ticket form one ticketless group. Each group gets its own draft and gate, in turn.

## Phase 1 — Draft

```
<ticket> - <sentence>
<pr url>
<pr url>
```

- No ticket → the first line is the sentence alone.
- One PR → the sentence is its title, minus any leading ticket number and separator.
- Several PRs → write one imperative sentence covering them, from their titles and what you know of the work, about the length of a PR title. Never use the issue title.
- PR URLs one per line, full `https://github.com/...` form, in the order given.

Write the draft to a temp file (outside any repo) and run the dry run, which also proves the chat is configured:

```
pwsh -NoProfile -File <this skill's dir>/post.ps1 -MessageFile <file> [-Ticket <n>] -DryRun
```

It prints `Chat: <name>` and the HTML. **No chat configured** → stop and tell the user to run `pwsh -NoProfile -File <this skill's dir>/post.ps1 -Setup -ChatLink "<link to any message in the review chat>" -Name "<chat name>"` themselves (it saves the chat and signs in through the browser; in Claude Code, prefix it with `!`); do not post.

## Phase 2 — Gate

Show the chat name, the draft in a code block exactly as written to the file, any notes from Phase 0 (dropped PRs, draft PRs), the CI state when you were invoked directly (`gh pr checks` summary per PR — information only, never a condition), and then this line:

```
post / skip / or tell me what to change
```

Then wait for the reply.

- `post` → Phase 3.
- `skip` → nothing is sent; end with "not posted".
- Anything else → treat it as edits (a reworded sentence, a removed PR, a full replacement). Apply them, rewrite the file, re-run the dry run, and show the new draft with the same line. Repeat until `post` or `skip`.

**Can't ask the user yourself** (you are a captain worker) → do not wait. Your playbook says how the draft is relayed; resume here with the relayed reply.

## Phase 3 — Post

```
pwsh -NoProfile -File <this skill's dir>/post.ps1 -MessageFile <file> [-Ticket <n>]
```

Pass `-Ticket` exactly when the first line starts with `<ticket> - `, so the number becomes the issue link. The script links bare URL lines and HTML-escapes everything else; it signs in silently from the token cache, or opens a browser sign-in if the cache is cold.

- **Success** → report the chat name and the PRs posted; remember them as posted for Phase 0.3.
- **Failure** → report the error verbatim and stop. A consent error (`AADSTS65001` or similar) means the tenant blocks user consent for Microsoft Graph PowerShell; tell the user an admin must consent to `ChatMessage.Send`, or that they need their own app registration.

## Rules

- One message per ticket; never split a ticket's PRs across messages within one call, never mix tickets in one message.
- Never post to any chat but the configured one; never edit or delete a posted message.
- Keep the temp files out of every repo working tree.
