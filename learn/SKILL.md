---
name: learn
description: Creates a structured learning plan for a new topic and saves it to a markdown file. Run once to set up. Then use /study to begin learning. Invoke with /learn [topic], e.g. /learn kubernetes.
argument-hint: "[topic]"
disable-model-invocation: true
---

Create a structured learning plan for: **$ARGUMENTS**

## Your task

1. **Assess topic currency** — before doing anything else, judge whether this topic would benefit from current research:
   - **Suggest `/research` if:** the topic is a fast-moving tool, cloud-native technology, AI/ML framework, or anything where best practices shift frequently (e.g. Kubernetes, ArgoCD, LLMs, a new framework)
   - **Skip it if:** the topic is a stable concept, language fundamental, or established pattern unlikely to have changed (e.g. TCP/IP, SQL, design patterns, algorithms)
   
   If research is warranted, tell the user: *"This topic moves fast — I'd recommend running `/research $ARGUMENTS learning resources best practices` first and pasting the results back so I can build a plan based on current information. Or say 'skip' to continue with what I know."* Wait for their response before continuing.

2. **Gauge starting point** — ask the user one question to understand their current level (e.g. complete beginner, some exposure, adjacent experience). Wait for the answer before proceeding.

2. **Build the syllabus** — based on their level, create a learning plan with:
   - A clear goal: what the user will be able to do/understand at the end
   - 4–8 modules in logical order, each with:
     - A title and one-sentence description
     - 2–3 key concepts covered
     - 1–2 specific resources (articles, docs, videos, books — real, linkable ones)
     - Estimated effort (e.g. "~30 mins reading")
   - A "Prerequisites" section if anything needs to be in place first

3. **Save the plan** — write the syllabus to `learn-$ARGUMENTS.md` in the current directory using this structure:

```
# Learning Plan: $ARGUMENTS

**Goal:** [one sentence]
**Level:** [beginner/intermediate/etc]
**Created:** [date]

## Progress
- [ ] Module 1: [title]
- [ ] Module 2: [title]
...

---

## Module 1: [title]
[description]

**Concepts:** concept1, concept2, concept3

**Resources:**
- [Resource name](url) — [one line on what it covers]

**Effort:** ~X mins

---
[repeat for each module]

## Notes
[empty — filled during /study sessions]
```

4. **Confirm to the user** — tell them the file has been saved and they can run `/study` to begin.

Do not start teaching. The plan is the only output of this skill.
