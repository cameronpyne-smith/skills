# Skills

## Description
- grill-me
Reach a shared understanding with the agent, like /plan. (Copy of mattpocock/skills).

## Installation
### Copilot CLI
Run `/skills add <path>`. (`/skills list` to check it is installed correctly).
Alternatively, clone in the default location at `~/.copilot/skills/` — Copilot CLI picks them up automatically from there.

### Claude Code
Copy the skill folder into `~/.claude/skills/<skill-name>/SKILL.md` for personal use across all projects, or `.claude/skills/<skill-name>/SKILL.md` inside a project for project-only use.
Claude Code watches the directory for changes and picks them up without restarting.
