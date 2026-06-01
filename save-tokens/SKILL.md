---
name: save-tokens
description: Silent execution mode. Do the work, output nothing. Use for quick tasks the user will verify themselves. Invoke with /save-tokens.
disable-model-invocation: true
---

Do the task. Do not narrate, explain, or confirm what you did.

Only output if:
- You hit an error that blocks completion
- You need a decision from the user to proceed

Nothing else. No "Done.", no summary, no commentary.
