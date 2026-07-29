---
name: "OPSX: Explore"
description: "Explore mode + draft requirements — produces docs/superpowers/specs/<date>-<topic>-requirements.md"
category: Workflow
tags: [workflow, explore, experimental, thinking]
---

5-phase explore command. Single user invocation, agent walks through phases in order.

**Input**: The argument after `/opsx:explore` is whatever the user wants to think about. Could be a vague idea ("real-time collaboration"), a specific problem ("the auth system is getting unwieldy"), a comparison ("postgres vs sqlite for this"), or nothing (just enter explore mode).

If a topic is given, derive a kebab-case `<topic>` from it (e.g., "real-time collaboration" → `realtime-collab`). The same `<topic>` will be the OpenSpec change name in `/opsx:propose`.

---

## Phase 1 — Explore stance (free thinking)

**This phase is the existing explore mode. NEVER write code, never modify code, never propose implementation. Thinking only.**

You may:
- Read files, search code, investigate the codebase
- Map existing architecture relevant to the discussion
- Find integration points and identify patterns already in use
- Surface hidden complexity
- Use ASCII diagrams liberally when they help
- Ask clarifying questions one at a time
- Compare options conversationally

You may NOT:
- Write or modify code
- Create OpenSpec artifacts (proposal/design/specs/tasks)
- Tell the user "now I'll implement"

The goal of Phase 1 is **the user's brain becomes clear about what they want**.

---

## Phase 2 — Draft requirements (DRAFT status)

When you judge that the conversation has reached enough clarity (typically after 5-15 turns), proactively offer:

> "I think we have enough to write a draft requirements doc. I'll save it to `docs/superpowers/specs/<date>-<topic>-requirements.md` with `Status: DRAFT`. We'll review it together in the next phase."

Wait for the user's confirmation. Then write the file using the requirements template (`openspec instructions requirements --schema superpowers-driven --json` returns the template). Required frontmatter:

```yaml
---
Date: <YYYY-MM-DD>
Change: <topic>
Status: DRAFT
HAS_UI_SURFACE: <yes|no — your best guess from the conversation>
---
```

Sections (Goals / Non-Goals / Constraints / Success Criteria / User Stories / Open Questions / Referenced Capabilities). Rough is fine. TODOs are allowed at this stage.

`git add` the file but DO NOT commit yet. Phase 5 commits.

---

## Phase 3 — Brainstorming review (REVIEWED status)

Invoke `superpowers:brainstorming` with the draft as input. Run its spec self-review checklist:

1. **Placeholder scan:** Any TBD / TODO / "..." / "fill in" remaining? Fix or escalate to the user.
2. **Internal consistency:** Do sections contradict each other? Does the architecture in (implicit) thinking match the requirements?
3. **Scope check:** Is this focused enough for a single OpenSpec change, or does it need decomposition? If it needs splitting, propose 2-3 sub-changes and ask which to pursue first.
4. **Ambiguity check:** Could any requirement be interpreted two ways? Pick one with the user, make it explicit.

After all gaps are resolved, change frontmatter `Status: DRAFT` → `Status: REVIEWED`. The propose phase will refuse to start if it sees `DRAFT`.

---

## Phase 4 — UI side-trip (only if HAS_UI_SURFACE: yes)

Skip this phase entirely if `HAS_UI_SURFACE: no`.

If `yes`:

**Style selection** — invoke the `awesome-design-md` skill. The skill presents available design system options (Notion, Linear, iOS Liquid Glass, etc.). The user picks one. Append the chosen style ID to the requirements doc as the last line:

```markdown
## Design System

Selected via awesome-design-md: `<style-id>` (see docs/design/<style-id>.md).
```

**Visual mocking** — re-invoke `superpowers:brainstorming` (or continue the existing brainstorming session from Phase 3) and explicitly request its Visual Companion mode (the brainstorming skill includes an offer-and-consent step for Visual Companion — accept it; subsequent visual questions are answered in the browser). The companion renders mocks in the browser; iterate with the user until the layouts and tokens are nailed down. Save the final HTML to:

```
docs/superpowers/specs/mocks/<date>-<topic>-mocks.html
```

The HTML must be self-contained (inline CSS, no external assets). Reference the chosen design system's tokens. Every desktop section must have a mobile equivalent (the mocks artifact instruction enforces this — see `openspec instructions mocks --schema superpowers-driven --json`).

---

## Phase 5 — Commit + handoff

Commit the requirements (and mocks if produced):

```bash
git add docs/superpowers/specs/<date>-<topic>-requirements.md
# also if mocks produced:
git add docs/superpowers/specs/mocks/<date>-<topic>-mocks.html
git commit -m "docs: requirements for <topic>"
```

Output to the user:

> "Requirements ready and reviewed. Next: `/opsx:propose <topic>` (do not auto-invoke; let the user trigger it)."

**Anti-pattern guard:** if the user says "just go ahead and propose / implement", REFUSE. Tell them: "Phase boundaries are explicit. Run `/opsx:propose <topic>` separately so the propose phase has a clean entry."

---

## Stance reminders

- One question at a time
- Multiple choice preferred over open-ended when applicable
- Patient — don't rush phases. If Phase 1 needs 20 turns, that's fine
- Visualize freely (ASCII diagrams)
- Open threads, not interrogations — surface multiple directions, let the user follow what resonates

## What you might do (not exhaustive)

**Explore the problem space** — clarifying questions, challenge assumptions, reframe, find analogies.

**Investigate the codebase** — map existing architecture, find integration points, identify patterns already in use, surface hidden complexity.

**Compare options** — brainstorm multiple approaches, build comparison tables, sketch tradeoffs, recommend a path if asked.

**Visualize** — ASCII diagrams when text isn't sufficient.
