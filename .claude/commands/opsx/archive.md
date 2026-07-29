---
name: "OPSX: Archive"
description: Archive a completed change + post-archive checklist (Purpose, README, pitfalls, project README, dev log, commit)
category: Workflow
tags: [workflow, archive, experimental]
---

Run `openspec archive` and then perform the post-archive cleanup that closes the loop on capability docs and pitfall sinking. Four numbered cleanup steps + dev log check + final commit.

**Input**: Optionally specify a change name. If omitted, infer from conversation context. If ambiguous, run `openspec list --json` and use **AskUserQuestion** to let the user select.

---

**Steps**

### 1. Pre-flight: confirm the change is shipped

Run:

```bash
openspec status --change <name>
```

Every artifact must be `done`. Every task in `tasks.md` must be `- [x]`. If any are not, warn the user and ask for confirmation to proceed.

If delta specs exist at `openspec/changes/<name>/specs/`, show a sync summary (compare each delta with the corresponding `openspec/specs/<capability>/spec.md`):

> "Delta specs detected for capabilities: `<list>`. Sync now (recommended) | Archive without syncing | Cancel."

If sync chosen, invoke `openspec-sync-specs` via the Skill tool.

### 2. Run the archive

**Before archiving, capture the commit range for this change** so later cleanup steps (3 and 5) can refer back to it after the change directory moves:

```bash
# Note the first commit that touched this change directory:
git log --diff-filter=A --format="%H" -- openspec/changes/<name>/.openspec.yaml | tail -1
# Note HEAD (latest commit on the change):
git rev-parse HEAD
```

Save both SHAs in your working memory as `<change-base-sha>..<change-head-sha>`.

```bash
openspec archive <name>
```

Expected: change directory moves to `openspec/changes/archive/<date>-<name>/`. Capability specs at `openspec/specs/<capability>/spec.md` are created (if new) or updated (if delta). The proposal / specs / design / tasks files now live at `openspec/changes/archive/<date>-<name>/` (referred to as `<archived-dir>` below).

### 3. Cleanup step 1 — fill capability spec `## Purpose`

`openspec archive` leaves a `## Purpose\nTBD - created by archiving change.` placeholder in any newly-created capability spec. Find them:

```bash
grep -l 'TBD - created by archiving' openspec/specs/*/spec.md
```

For each match, write a 1-3 sentence Purpose derived from:
- The change's `<archived-dir>/proposal.md` Why section
- The requirements doc at `docs/superpowers/specs/<date>-<name>-requirements.md` Goals section

Replace the placeholder. Commit when all are filled.

### 4. Cleanup step 2 — update `openspec/specs/README.md`

Open `openspec/specs/README.md`. Find the section listing capabilities. Add or update the entry for the new/modified capability. Use the existing format:

```markdown
### `<capability-name>` ✅ 已实现
**用户故事**: <one sentence>
**覆盖需求**: <requirement IDs>
**后台**: <bullet list>
**前台**: <bullet list>
**验收标准**: <one sentence>
```

If the format differs, follow the existing pattern in this specific README — don't impose your own.

### 5. Cleanup step 3 — update `CLAUDE.md` pitfalls

First, read `openspec/changes/archive/<date>-<name>/eval-log.md` (it was archived with the other artifacts). Find any entries where `attempt > 1` — these groups needed multiple evaluator passes, which is a structural signal that something non-obvious happened. For each such group, read the `findings` from the failed attempts: if they describe a foot-gun worth documenting (timing-sensitive behavior, env-var ordering, schema migration edge case, boundary condition the spec didn't make explicit), that's a CLAUDE.md pitfall candidate.

Then read the dev log entry at `docs/log/<date>.md` (if it exists) and the change diff via `git log --oneline <change-base-sha>..<change-head-sha>` plus `git diff <change-base-sha>..<change-head-sha>` (using the SHAs captured in step 2). If any non-obvious gotcha emerged (timing-sensitive bootstrap, env-var ordering, schema migration foot-gun, file-handling edge case), append a 2-3 line entry to the relevant section of `CLAUDE.md`'s Pitfalls.

If no new pitfall surfaced, skip this step. Don't fabricate pitfalls.

### 6. Cleanup step 4 — conditional project README

Decision: does this change introduce **user-visible** new features or behavior changes?

- Yes → ask the user: "This change introduces <description>. Do you want to update the project root README.md? Suggested addition: <draft>." Only update with user confirmation.
- No (operations / internals / infrastructure only) → skip.

Examples:
- `multi-user-auth-core` → YES (new login flow) → update README's "Getting Started" section
- `nas-deployment` → NO (ops change, no user-facing behavior) → skip
- `auth-rate-limiting` → NO (internal hardening, no UX change) → skip
- `multi-user-auth-admin-ui` → YES (new admin UI) → update README

### 6b. Cleanup step 5 — register signadot plans (only if present)

If `<archived-dir>/signadot-plans/` contains plan yamls, move each validated plan into the owning capability's durable library:

```bash
mkdir -p openspec/specs/<capability>/plans
git mv openspec/changes/archive/<date>-<name>/signadot-plans/<behavior-id>.yaml openspec/specs/<capability>/plans/
```

The accumulating `selectionHint` catalog under `openspec/specs/*/plans/` is the versioned plan library — future changes touching the same behavior reuse these plans instead of authoring from scratch. If a plan's behavior failed final validation or was descoped, delete it instead of registering it; note why in the commit message.

### 6c. Cleanup step 6 — tear down validation environment (only if signadot was used)

The change's ephemeral validation resources should not outlive the archive:

```bash
signadot sandbox list                       # any sandbox created for this change?
signadot sandbox delete <sandbox-name>      # ask first if it might be shared
```

Also sweep:
- **Draft/probe plans** created while iterating: delete unexecuted ones (`signadot plan delete <id>`); executed plans cannot be deleted (server keeps them as audit trail) — that's fine, the registered yaml in `openspec/specs/<cap>/plans/` is the durable artifact.
- **Fork images**: remove from the local docker daemon and the cluster nodes (e.g. `kind`: `docker exec <node> ctr --namespace k8s.io images rm docker.io/library/<image>`), plus any `dist/` build output.
- **Baseline mutations** made for smoke testing (image overrides, temporary port-forwards): restore/stop them.

Keep: the Managed Plan Runner (future changes reuse it) and the registered plan library entry.

### 7. Dev log check

Check whether `docs/log/YYYY-MM-DD.md` for today's date exists (use the Glob tool or, in bash: `ls docs/log/$(date +%Y-%m-%d).md 2>/dev/null`; in PowerShell: `Get-ChildItem docs/log/$((Get-Date).ToString('yyyy-MM-dd')).md`).

If missing, prompt:

> "No dev log entry for today (`docs/log/<today>.md`). Want me to draft one based on this change? (Y/N)"

If Y, draft from the proposal + commits + review findings; let the user finalize. If N, skip.

### 8. Commit cleanup + final summary

```bash
git add openspec/specs/ openspec/changes/archive/ CLAUDE.md README.md docs/log/
git commit -m "chore: archive <name> cleanup (Purpose, README, pitfalls, dev log)"
```

Output:

> "Change `<name>` archived. Workflow complete. Capability spec(s) at openspec/specs/<...>/. Archive at openspec/changes/archive/<date>-<name>/."

---

**Guardrails**

- NEVER skip Cleanup step 1 (Purpose). The TBD placeholder is the canonical example of what this rewrite is fixing.
- DO ask for confirmation before updating project README — that's user-facing surface.
- DO NOT fabricate pitfalls for CLAUDE.md if nothing genuinely surprised you in the change.
- DO commit cleanup steps as one atomic commit (not per-file) so the archive log is clean.
