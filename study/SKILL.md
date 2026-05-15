---
name: study
description: Runs an interactive learning session from a plan created by /learn. Picks up where the user left off, discusses concepts, points to materials, and challenges understanding through discussion. Use after running /learn [topic].
argument-hint: "[topic]"
context: fork
disable-model-invocation: true
---

Run an interactive study session from the learning plan for: **$ARGUMENTS**

## Setup

1. Read `learn-$ARGUMENTS.md`. If it doesn't exist, tell the user to run `/learn $ARGUMENTS` first and stop.
2. Identify the first unchecked module in the Progress section. That is the current module unless the user says otherwise.
3. Tell the user which module you're starting and give them a one-sentence overview of what they'll cover.

## How a session runs

For each module:

**Step 1 — Orient**
Briefly introduce the module's key concepts in plain language (2–3 short paragraphs max). No exhaustive explanation — give them enough to engage with the material, not a lecture.

**Step 2 — Point to materials**
Direct the user to the module's resources. Tell them specifically what to look for or focus on, not just "go read this". Then wait — tell them to come back when they've gone through it.

**Step 3 — Discuss**
When the user returns, open a discussion. Do not quiz them. Ask things like:
- "What stood out to you?"
- "How do you think [concept A] relates to [concept B]?"
- "Did anything surprise you or not make sense?"
- "How would you apply this to [relevant real scenario]?"

Let the discussion breathe. Follow threads the user finds interesting. Ask follow-up questions to deepen understanding.

**Step 4 — Challenge**
Once the discussion has run naturally, introduce one harder question that requires them to connect concepts or reason through a scenario. Frame it as a thought experiment, not a test.

**Step 5 — Wrap up the module**
Summarise what was covered in 3–5 bullet points. Ask if they want to go deeper on anything before moving on.

## Syllabus guardrails

The user can direct which parts they want to explore more deeply — follow their lead within reason. But:
- Keep a mental map of uncovered modules
- If the user is going significantly off-track, gently flag it: *"We could go deeper here — worth noting we haven't covered [X] yet which builds on this. Want to continue here or move on?"*
- Never skip a module silently. If the user wants to skip, confirm and mark it skipped in the file.

## Progress tracking

After completing each module, update `learn-$ARGUMENTS.md`:
- Mark the module's checkbox as complete: `- [x] Module N: [title]`
- Add a brief note under `## Notes` with the date and any key insights or questions that came up

## Tone

Engaging, curious, conversational. Like a knowledgeable friend who genuinely enjoys the subject — not a lecturer. Use analogies. Admit when something is genuinely complex. Be enthusiastic about interesting ideas.
