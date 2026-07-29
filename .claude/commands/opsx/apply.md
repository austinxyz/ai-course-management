---
name: "OPSX: Apply"
description: Execute tasks.md with TDD + review skills wired into the gates
category: Workflow
tags: [workflow, artifacts, experimental]
---

Execute the tasks defined in `openspec/changes/<topic>/tasks.md`. Invoke superpowers skills at the gates the planning phase wired in.

**Input**: Optionally specify a change name (e.g., `/opsx:apply add-auth`). If omitted, infer from conversation context. If ambiguous, run `openspec list --json` and use **AskUserQuestion** to let the user select.

---

**Setup**: Before starting, read `openspec/config.yaml` and note the `project` section:
- `project.dev_stack_command` — command to bring up the dev stack (used in VISUAL DIFF tasks)
- `project.test_commands` — list of test commands (used in verification step)
- `project.e2e_command` — e2e test command (optional)
- `project.custom_verification_checks` — appended to verification-before-completion
- `project.design_system` — design system name (referenced in MOCK tasks for token naming)

Also note these new artifact paths for this change:
- `openspec/changes/<name>/contracts/` — contract files written by N.0 CONTRACT tasks
- `openspec/changes/<name>/eval-log.md` — evaluator score history (pre-created by propose)

---

**Steps**

### 1. Select change + read context

Announce: "Using change: `<name>`. Override: `/opsx:apply <other>`."

```bash
openspec status --change <name> --json
openspec instructions apply --change <name> --json
```

Parse `contextFiles` from the apply instructions. READ each one (proposal, specs, design, mocks, requirements) so you have full context before touching code.

### 2. Session start: invoke superpowers:test-driven-development

Use the **Skill** tool to invoke `superpowers:test-driven-development`. The skill enforces "no GREEN without a RED predecessor" throughout the session. This is mandatory; do not skip.

### 3. Walk task groups

For each `## N` task group in `tasks.md`:

For each task, dispatch by prefix:

Convention for the task ordinal `N.X`: `N` is the group number; `X` is the position within the group (1, 2, 3, …). The keyword AFTER `N.X` (RED / GREEN / MOCK / VISUAL DIFF / Run …) decides dispatch — NOT the ordinal letter. The schema's tasks template assigns the last-in-group code-review task position `Z` by convention, but you should match on the "Run superpowers:requesting-code-review" prefix, not on `.Z`.

- **`- [ ] N.X RED — ...`** → write the failing test, run it, confirm the failure mode matches the description (often "function not defined" or "expected X got undefined"). Mark the checkbox.

- **`- [ ] N.X GREEN — ...`** → write the minimal code to pass. Run the test. Confirm pass. Mark the checkbox.

- **`- [ ] N.X MOCK — ...`** → open the mock file at the path shown in the task. Note the design tokens and verbatim text strings called out. Mark the checkbox.

- **`- [ ] N.X VISUAL DIFF — ...`** → bring up the dev stack (`project.dev_stack_command` from `openspec/config.yaml`, or whatever the task says), navigate to the route, eyeball the rendered UI against the mock. Fix any token/color/text drift. Mark the checkbox.

- **`- [ ] N.0 CONTRACT — ...`** → read the `### Contract` block above group N in `tasks.md`. Write its content verbatim to `openspec/changes/<name>/contracts/group-N.md`. Confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding. Mark the checkbox.

- **`- [ ] N.V VALIDATE — ...`** → only present when the group's Contract binds a signadot plan. (1) Invoke the `signadot-plan` skill: re-validate the draft at `openspec/changes/<name>/signadot-plans/<behavior-id>.yaml` against `signadot plan schema` (real actionIDs, refs), bind every declared param with the now-known concrete values (URLs, payloads, tokens), then `signadot plan create -f` + run it. (2) Invoke the `signadot-validate` skill for the surrounding sandbox workflow: sandbox for the changed service(s), routing-key injection (`baggage: sd-routing-key=<key>`), traffic through the cluster `.svc` URL — never localhost. If plan actions can't express an assertion, fall back to the skill's other validation types (integration test / e2e / browser) and capture the same fields. (3) Append the verdict to `eval-log.md`:

  ```yaml
  - group: N
    validate:
      plan: <behavior-id>
      status: pass | fail
      env_url: <ephemeral env URL if available>
      assertions: [{name: "...", result: pass|fail}]
  ```

  (4) `status: fail` → treat exactly like an evaluator BLOCK: pause, report failed assertions, offer fix/skip/abort. Do not proceed to N.E with a failed verdict. Mark the checkbox only on pass or after the user chooses to proceed.

- **`- [ ] N.E EVAL — ...`** → spawn evaluator subagent (haiku model). See **Evaluator Subagent** and **Retry Loop** sections below. Do NOT mark the checkbox until the evaluator returns PASS. On BLOCK, pause immediately and report to the user. On PASS, mark the checkbox and continue to next group.

- **`- [ ] N.X FIX — ...`** → execute like a GREEN task: write the minimal code change described in the task. Run the relevant test to confirm the fix takes effect. Mark the checkbox. The next task will be another N.E EVAL — the retry loop re-fires automatically.

### Evaluator Subagent

Spawn via the **Agent** tool with `model: haiku`. Pass ONLY these files as context — do not pass the full apply-session conversation:

- `openspec/changes/<name>/contracts/group-N.md`
- `openspec/changes/<name>/specs/<cap>/spec.md` (all capability specs for this change)
- `openspec/changes/<name>/design.md`
- The git diff for files modified in group N: run `git diff HEAD~<n>..HEAD -- <files changed in group N>` and include the output

Before passing the prompt, substitute the current `attempt` count in place of `<attempt_number>` in step 8's YAML block.

Evaluator prompt (pass this verbatim to the subagent):

> You are an external evaluator with a skeptical lens. You have no knowledge of the implementation decisions made during this session.
>
> 1. Invoke `superpowers:requesting-code-review` on the provided diff. If you find CRITICAL or HIGH severity issues, return immediately with `STATUS: BLOCK` and the findings. Do not score.
> 2. Run the Runtime test command from the contract. Execute it as a shell command in the repo root and record pass/fail and output.
> 3. Compare the diff against each SHALL statement in the contract's Spec section. Score 0–100.
> 4. Score Runtime 0–100. FIRST check `eval-log.md` for a `validate:` entry for this group: if present, Runtime = 100 when its status is pass, 0 when fail — the real-cluster verdict overrides your own run. Only if no validate entry exists: run the Runtime test command from the contract (100 = all tests pass, 0 = test command fails to run).
> 5. Score Code 0–100 based on requesting-code-review findings (no CRITICAL/HIGH assumed at this point).
> 6. Compute total = (Spec × 0.4) + (Runtime × 0.4) + (Code × 0.2).
> 7. Read the Threshold from the contract.
> 8. Append to `openspec/changes/<name>/eval-log.md`:
>    ```yaml
>    - group: N
>      attempt: <attempt_number>
>      scores: {spec: X, runtime: Y, code: Z}
>      total: T
>      status: PASS | RETRY
>      findings:
>        - "<dimension>: <specific finding>"
>      fix_tasks:
>        - "N.F1 FIX — <specific actionable fix>"
>    ```
> 9. If total ≥ threshold: return `STATUS: PASS`.
>    If total < threshold: append the fix_tasks as `- [ ] N.F1 FIX — ...` checkboxes to group N in `tasks.md`, then return `STATUS: RETRY`.

### Retry Loop

The apply agent manages attempt counting per group. Initialize before spawning the first evaluator for each group:

```
attempt = 1
score_history = []
```

After each evaluator result:

- **BLOCK** → pause immediately: "Group N BLOCKED — CRITICAL/HIGH code issue found. Options: (1) Fix the issue manually and type 'resume' to re-run N.E EVAL (attempt count resets to 1), (2) Skip group N, (3) Abort apply." Do not retry automatically.
- **PASS** → mark N.E EVAL checkbox `[x]`, advance to next group.
- **RETRY** →
  - Append `result.total` to `score_history`
  - Increment `attempt`
  - **Escalate if:** `attempt > 3` OR `(len(score_history) >= 2 AND score_history[-1] - score_history[-2] < 5)` — note: a score regression (worsening) also triggers escalation, since the delta will be negative (< 5).
  - If escalating: pause with score history — "Group N failed after {attempt-1} attempts. Score history: {score_history}. Last findings: {findings}. Options: (1) Fix manually then type 'resume', (2) Skip group N, (3) Abort apply."
  - Otherwise: FIX tasks were already appended to `tasks.md` by the evaluator. Execute them, then re-spawn the evaluator.

- **Final group's verification task** (`Run superpowers:verification-before-completion`) → invoke `superpowers:verification-before-completion`. Runs pytest / vitest / e2e / `console.log` audit. Fix any failures before marking complete.

Mark each task `- [x]` immediately after completing it (not in a batch at the end).

### 4. On completion or pause: status

Run:

```bash
openspec status --change <name>
```

If all tasks are `- [x]`:

> "Apply complete. Next: ship (e.g. `git push`, plus any project-specific deploy — see CLAUDE.md), then `/opsx:archive <name>`."

If paused (blocker, error, ambiguity, user interrupt):

> "Paused at task `<N.X>`. Reason: <description>. Options: <1>, <2>, <other approach>. What would you like to do?"

---

**Guardrails**

- DO invoke `superpowers:test-driven-development` at session start. Don't pretend.
- DO spawn an evaluator subagent at every group's `N.E EVAL` checkpoint. Never fold evaluator logic into the apply agent's context — the fresh context is the point.
- DO write `contracts/group-N.md` at the `N.0 CONTRACT` step before any RED/GREEN tasks in the group. All three fields (Spec, Runtime, Code) must be non-empty.
- DO manage the retry loop per-group. Max 3 attempts; plateau < 5pt between attempts triggers escalation.
- NEVER invoke `superpowers:requesting-code-review` directly during apply — the evaluator subagent invokes it internally.
- DO mark each task `- [x]` immediately after completing it.
- DON'T skip RED tasks ("the test is obvious; I'll just GREEN"). The TDD skill catches this.
- DON'T proceed past a group's checkpoint with unaddressed CRITICAL or HIGH review findings.
- DO pause if a task reveals a design issue. Suggest updating proposal/design/specs as appropriate; don't paper over it.
- DO run N.V VALIDATE before N.E EVAL in groups that bind a signadot plan — the evaluator reads the verdict as Runtime evidence; skipping N.V reverts Runtime to a guess, which defeats the binding.
