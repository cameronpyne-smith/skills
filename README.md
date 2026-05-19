# Skills

## Installation
### Copilot CLI

Run ```https://github.com/cameronpyne-smith/skills``` inside a project for project-only use, or for global use run the command outside a repo directory in `{directoryPath}` of your choice and run ```/skills add {directoryPath}``` inside copilot CLI.

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
- **bsp [server] &lt;request&gt;** — Interact with any BSP/OAP-compliant service. Queries, commands, and server management. Run `/bsp add-server <url>` to configure a server.


