# design-sync notes — ai-course-management

## Repo shape

- `frontend/` is a plain Next.js 15 app, not a published component-library
  package. `components/ui/` has no separate build (`package.json`'s `build`
  script is `next build`, which doesn't emit an importable dist).
- `cfg.entry` (`frontend/.ds-entry-anchor.js`) is a **deliberately
  nonexistent** placeholder path. Its only purpose is to make the
  converter's PKG_DIR walk-up land on `frontend/` (which has a real
  `package.json`), so the converter falls into synth-from-src mode
  (`[NO_DIST] no built entry — synthesizing from N src files`). Do not
  create that file — if it starts existing, the converter will try to bundle
  it as a real dist entry and component discovery breaks (no `.d.ts` tree to
  read from).
- Because of synth-from-src mode, component discovery is a PascalCase-export
  scan over `components/ui/*.tsx` — new components must be plain
  `export function Name(...)` (or `export const Name = ...`) in a `.tsx`
  file directly under `components/ui/` to be picked up automatically.

## CSS entry — MUST regenerate before every rebuild

`cfg.cssEntry` (`.tailwind-compiled.css`) is a **static, manually-compiled**
Tailwind v4 stylesheet, not `app/globals.css` itself — pointing the converter
straight at `globals.css` fails with
`[CSS_IMPORT_MISSING] _ds_bundle.css @imports "tailwindcss" which doesn't
exist`, because that file only contains `@import "tailwindcss";`, not
resolved utility classes. Next's own build doesn't help either — Turbopack
writes compiled CSS under content-hashed filenames in `.next/`, which shift
on every build and can't be a stable `cfg.cssEntry`.

Regenerate it from `frontend/` before every design-sync rebuild:

```bash
cd frontend && npx --yes @tailwindcss/cli -i ./app/globals.css -o ./.tailwind-compiled.css
```

The file is gitignored (`frontend/.tailwind-compiled.css`) — it's a build
artifact, not source.

## Render check

Playwright + chromium installed as a devDependency under `.ds-sync/`
(gitignored, staged-scripts-only). No known render warns yet — the render
check ran clean (0 bad, 0 thin, 0 identical-variants) after all 7 components
got authored previews.

## Design placeholder status

All color tokens in `frontend/app/globals.css` (`--color-primary`,
`--color-surface`, etc.) are neutral grayscale placeholders. Real brand
colors are being designed in claude.ai/design (project `ai-course-design`,
this same sync target) and will land back in `globals.css` — at that point,
`.tailwind-compiled.css` must be regenerated and the DS re-synced so the
uploaded bundle picks up the real colors. `conventions.md` already carries
this notice for the design agent.

## Re-sync risks

- **`.tailwind-compiled.css` is the single most likely staleness source** —
  any token/class change in `globals.css` or new Tailwind utility used in a
  component is invisible to design-sync until that file is regenerated.
  Always regenerate it as the first step of any re-sync.
- The 7 authored previews in `previews/` are hand-written composition
  examples (Chinese student-roster content) — if real component APIs change
  (new variant, renamed prop), the previews need matching edits or they'll
  render the old shape.
- No subagent fan-out was used for this sync (only 7 tiny components) — no
  `.design-sync/learnings/` files exist and none should appear from a normal
  re-sync of this size.
