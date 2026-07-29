---
name: "OPSX: Propose"
description: Create an OpenSpec change from a reviewed requirements doc; generates all artifacts
category: Workflow
tags: [workflow, artifacts, experimental]
---

Create an OpenSpec change with all artifacts. Pre-condition: a reviewed requirements doc exists at `docs/superpowers/specs/<date>-<topic>-requirements.md`.

**Input**: The argument after `/opsx:propose` is the change name (kebab-case). The same `<topic>` used in `/opsx:explore`.

---

**Steps**

### 1. Pre-flight: requirements gate

Locate the requirements doc:

```bash
ls docs/superpowers/specs/*-<topic>-requirements.md 2>/dev/null
```

If no file matches → REFUSE with:

> "No requirements doc found for `<topic>`. Run `/opsx:explore <topic>` first to produce `docs/superpowers/specs/<date>-<topic>-requirements.md`."

If found, read its frontmatter. Check `Status:` field:

- `Status: DRAFT` → REFUSE with:
  > "Requirements doc is `Status: DRAFT`. Run `/opsx:explore <topic>` Phase 3 (brainstorming review) to bring it to `Status: REVIEWED` before proposing."
- `Status: REVIEWED` → proceed.

Also note `HAS_UI_SURFACE` — drives mocks branching at step 4.

### 2. Create the change directory

```bash
openspec new change <topic> --schema superpowers-driven
```

This scaffolds `openspec/changes/<topic>/` with `.openspec.yaml` set to `superpowers-driven`.

### 3. Generate artifacts in dependency order

```bash
openspec status --change <topic> --json
```

Use the `artifacts` array to walk dependency-ready artifacts. For each:

```bash
openspec instructions <artifact-id> --change <topic> --json
```

Read the returned `template`, `instruction`, `dependencies`. For each dependency listed, READ the dependency artifact file from disk before generating.

Use the **TodoWrite tool** to track artifact-generation progress.

Order: `proposal` → `specs` → `design` → `mocks` → `tasks`.
(`requirements` was created in `/opsx:explore`; openspec sees it as `done`.)

**Path resolution caveat:** the `outputPath` returned by `openspec instructions` for `requirements` and `mocks` artifacts contains literal `{{date}}` and `{{change}}` strings (OpenSpec does NOT auto-substitute). You must substitute them before writing the file. For example, `outputPath: "../../../docs/superpowers/specs/{{date}}-{{change}}-requirements.md"` with `date=2026-05-10`, `change=multi-user-auth-core` resolves to `docs/superpowers/specs/2026-05-10-multi-user-auth-core-requirements.md`.

### 3a. Fill in Contract blocks in tasks.md

After the `tasks` artifact is generated, the `### Contract` blocks contain placeholder comments. Fill them in now — the N.0 CONTRACT task in apply will copy this content to a file; the content decisions happen here.

The generated `tasks.md` uses the harness template: each group has an `N.0 CONTRACT` task (first) and an `N.E EVAL` task (last). Verify these entries appear in the generated file — if you see `N.Z Run superpowers:requesting-code-review` instead, the schema lock is pointing to the old template. Fix it before proceeding.

For each `## N` group in `openspec/changes/<topic>/tasks.md`:

**Spec field:** Read `openspec/changes/<topic>/specs/<cap>/spec.md`. Identify which SHALL statements this group's tasks implement (by reading the task descriptions). Copy those SHALL statements verbatim into the Contract's Spec field. If multiple capabilities are touched, include statements from each. If no SHALL statements map to this group (e.g., pure infrastructure task), write `N/A — infrastructure group` and note why.

**Runtime field:** Read `openspec/config.yaml` → `project.test_commands`. Choose the command most relevant to this group's tests (e.g., for a backend group: `pytest tests/<module>/`; for a frontend group: `vitest run src/<module>/`). Scope the path to the files this group touches if possible. Set expected to a plain-language description of what passing looks like (e.g., "all 4 tests pass, no import errors"). If `project.test_commands` is absent or empty in `openspec/config.yaml`, write `command: TBD` and `expected: TBD — test harness not yet configured`.

**Code field:** Read `openspec/changes/<topic>/design.md`. Extract the design decisions and risk points that apply to this group. 1–3 bullet points. Examples: "must use repository pattern, no direct DB calls in route handler", "token must be validated before any capability check".

**Threshold field:**
- Default: `80`
- If the group contains a `VISUAL DIFF` task: `70` (visual judgment has inherent subjectivity)

After filling all groups, pre-create the `contracts/` directory and `eval-log.md`:

```bash
mkdir -p openspec/changes/<topic>/contracts
```

Create `openspec/changes/<topic>/eval-log.md` with this header (substituting the actual topic name):

```markdown
# Eval Log — <topic>

<!-- Appended by evaluator subagent after each N.E EVAL run -->
```

### 3b. Signadot plans for integration-critical groups (optional per group)

Skip this step entirely if `integrations.signadot.enabled` is absent or false in `openspec/config.yaml`.

A group is **integration-critical** when its behavior spans services and is user-visible end-to-end (the kind that passes unit tests but breaks the system).

**Decision checklist** — score each group against these signals:

| Signal | Present → bind a plan | Absent → plain test command |
|---|---|---|
| Call chain crosses ≥2 services | e.g. frontend → driver → redis | single-service internal logic |
| Async hop in the path | message queue, polling loop | synchronous calls only |
| Shared runtime state | a store key written by one side, read by another | pure in-memory / pure computation |
| Deployment-surface change | k8s Service, ports, routing | code-only change |
| Failure mode = "units green, system broken" | dropped routing key, TTL expiry, unreachable port | failures caught directly by unit tests |

Litmus question: *"With this group's unit tests all green, how could the user-visible behavior still break?"* A concrete answer (cross-service / async / shared-state / deployment reason) → bind a plan. No answer → don't.

Counter-guardrail: plans run real sandboxes against the real cluster — slow and costly. Bind them at service seams only; a pure-logic group with a plan is waste. Verification/ship groups never bind one.

For each integration-critical group:

1. Pre-create the plans directory (parallel to `contracts/`):

   ```bash
   mkdir -p openspec/changes/<topic>/signadot-plans
   ```

2. Author `openspec/changes/<topic>/signadot-plans/<behavior-id>.yaml` — a **parameterized plan draft with unbound params** (no concrete URLs/payloads yet; they don't exist until apply). Invoke the `signadot-plan` skill to author it: follow its schema-discovery workflow (`signadot plan schema`, action catalog — steps reference `action.actionID`, not action names). If the cluster/CLI is unreachable at propose time, write the draft with the behavior narrative, declared-but-unbound `params`, intended steps, and per-step assertions; note at the top that the spec must be re-validated against `signadot plan schema` at apply N.V. Include a `selectionHint` describing what the plan validates (used at tagging — lets an agent match plan to diff).

3. Rewrite that group's Contract **Runtime** field to the binding form:

   ```
   - **Runtime**: validated by signadot plan `<behavior-id>`
   ```

4. Ensure the group has an `N.V VALIDATE` task between its last GREEN (or VISUAL DIFF) and `N.E EVAL` (the template shows the form at 2.V).

Groups that are NOT integration-critical keep the plain test-command Runtime and get no plan and no N.V task.

### 4. After proposal generation: branch on HAS_UI_SURFACE

Read the just-written `openspec/changes/<topic>/proposal.md` frontmatter.

- `HAS_UI_SURFACE: yes` → confirm `docs/superpowers/specs/mocks/<date>-<topic>-mocks.html` exists with substantive content (more than the stub form). If missing or stub-only, REFUSE and direct the user back to `/opsx:explore` Phase 4.
- `HAS_UI_SURFACE: no` → mocks file should be the 1-line stub. The schema's mocks instruction handles the stub generation; verify after that step.

### 5. Verify all artifacts

```bash
openspec status --change <topic>
```

Every artifact should be `done`. If any are not, troubleshoot the specific artifact.

### 6. Commit and handoff

```bash
git add openspec/changes/<topic>/
# Only if HAS_UI_SURFACE: yes AND the mocks file hasn't already been committed in /opsx:explore Phase 5:
git add docs/superpowers/specs/mocks/*-<topic>-mocks.html
git commit -m "docs: propose <topic> change"
```

Verify with `git status` before committing — the second `git add` is conditional. For backend-only changes (`HAS_UI_SURFACE: no`), the mocks file may already be the stub from `/opsx:propose` Step 3 (mocks artifact generation) or absent entirely; check before staging.

Output:

> "Change `<topic>` proposed. Artifacts: requirements (in docs/), proposal, specs, design, mocks, tasks. Next: `/opsx:apply <topic>`."

---

**Guardrails**

- NEVER bypass the Status: REVIEWED check. If the user insists, send them back to `/opsx:explore` Phase 3.
- NEVER write artifacts that the schema would generate via `openspec instructions`. Always go through the CLI.
- If a change with that name already exists at `openspec/changes/<topic>/`, ask the user whether to continue (delete and re-create) or pick a different name.
- ALWAYS fill in `### Contract` blocks in tasks.md before committing. Placeholder comments in Contract blocks are plan failures — the evaluator cannot score against empty criteria.
- `context` and `rules` from `openspec instructions` output are constraints on YOU (the agent), not content to copy into artifact files.
- Signadot plans are propose-phase artifacts (what correct means) — author the yaml with unbound params here; NEVER fill in concrete URLs/payloads at propose. Binding happens at apply N.V.
