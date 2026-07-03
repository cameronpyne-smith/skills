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
- **pr-comments** — Works through the open comments on the current branch's PR. Fixes valid ones, rebuts invalid ones with evidence, and asks about the rest; presents a report for approval before it commits, pushes, replies, and resolves. Depends on **grill-me**.
- **pr [branch-name]** — Ships the working tree as a PR: branches off latest main, commits everything, pushes, creates the PR, then waits for Copilot's automatic review and chains into **pr-comments** to action it. Re-run safe. Depends on **pr-comments**.
