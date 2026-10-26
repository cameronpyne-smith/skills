# Skills

## Installation
### Copilot CLI

Run ```npx skills add cameronpyne-smith/skills``` inside a project for project-only use, or for global use run the command outside a repo directory in `{directoryPath}` of your choice, (still select `Project` under `Installation Scope`) and run ```/skills add {directoryPath}/.agents/skills``` inside copilot CLI.

### Claude Code
Copy the skill folder into `~/.claude/skills/<skill-name>/SKILL.md` for personal use across all projects, or `.claude/skills/<skill-name>/SKILL.md` inside a project for project-only use.

---

## Description
- **grill-me** — Reach a shared understanding with the agent, like /plan. (Copy of mattpocock/skills).
- **summarise** — Condenses a response to bullet-point TL;DR only. One-shot, no persistence.
- **discuss** — Discussion-only mode. Critically examines an idea — challenges assumptions, surfaces trade-offs, proposes alternatives. No implementation.
- **troubleshoot** — Systematic narrowing-down mode for issues the AI cannot directly observe. Guides information gathering step-by-step until root cause is certain before suggesting a fix.
- **learn [topic]** — Generates a structured learning syllabus for a new topic and saves it to `learn-[topic].md`. Run once to set up.
- **study [topic]** — Runs an interactive study session from a `/learn` plan. Discussion-based learning, not quizzes. Tracks progress in the plan file.
- **bsp [server] <request>** — Interact with any BSP/OAP-compliant service. Queries, commands, and server management. Run `/bsp add-server <url>` to configure a server.
- **save-tokens** — Silent execution mode. Does the work, outputs nothing. For quick tasks you verify yourself.
- **pr-comments** — Works through the open comments on the current branch's PR. Fixes valid ones, rebuts invalid ones with evidence, and asks about the rest; pushes, replies, and resolves automatically when nothing needs your decision, otherwise presents a report for approval first. Depends on **grill-me**.
- **pr [branch-name]** — Ships the working tree as a PR: branches off latest main, commits everything, pushes, creates the PR, then loops review → **pr-comments**, reviewing again after every round that pushed fixes (max 3 reviews). The reviewer is GitHub Copilot, or the `remundo-sdlc` plugin's review in the repos its `review_repos` option covers. Waits for CI, then offers the Teams review post via **pr-post** when the PR is new and green. Re-run safe. Depends on **pr-comments**, **pr-post**.
- **pr-post [pr…]** — Posts `<ticket> - <one sentence>` plus the PR links to your Teams review chat, as you, after you approve or edit the exact text. One message per ticket; skips PRs already posted this session. Needs PowerShell 7; run `pwsh -File pr-post/post.ps1 -Setup -ChatLink "<link to a message in the chat>" -Name "<chat name>"` once to pick the chat (stored in `~/.config/pr-post/config.json`) and sign in. The only Graph permission is `ChatMessage.Send`, which may need admin approval in your tenant.
- **captain [ticket-id…]** — Fleet manager for ticket-working agents (**Claude Code only** — uses background agent threads). Routes Remundo tickets to their repo, spawns one worker per ticket in its own worktree to investigate, implement, test (evidence contract + roadmap in `captain/testing.md`), and ship via **pr**; PR-comment actions and the Teams review post gate through you. Bare `/captain` = fleet status + housekeeping. Depends on **pr**, **pr-comments**, **pr-post**.
