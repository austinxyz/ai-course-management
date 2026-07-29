## Wrapping and setup

No provider or root wrapper is required — every component reads only from CSS
custom properties resolved by the cascade (`:root` / `.dark`), not from React
context. Rendering any component standalone is safe; there is no theme
provider to forget.

Dark mode: add class `dark` to a wrapping element (e.g. `<html class="dark">`)
to switch the token values. Without it, dark mode also falls back to
`prefers-color-scheme: dark` automatically.

**Placeholder-color notice**: every color token right now is a neutral
grayscale placeholder (see `tokens/` in this bundle). Real brand colors are
being designed separately in claude.ai/design and will replace these values
in a later re-sync — do not treat the current gray/black look as the final
brand, but the token *names* and component APIs below are stable.

## Styling idiom

This is a Tailwind utility-class system with a semantic token layer on top —
never use raw Tailwind palette classes (`bg-gray-900`, `border-neutral-200`)
for anything this system already names below. Use the semantic family
instead:

| Token family | Utility classes |
|---|---|
| Surface | `bg-background`, `bg-surface`, `bg-surface-muted` |
| Text | `text-foreground`, `text-muted` |
| Border | `border-border` |
| Action | `bg-primary` / `text-primary-foreground` |
| Status | `bg-danger` / `text-danger-foreground`, `bg-success` / `text-success-foreground` |
| Radius | `rounded-token` (the system's one corner radius — not `rounded-md`/`rounded-lg`) |

All of the above are real Tailwind v4 `@theme` entries generated from CSS
variables in `styles.css` — they compose with any other Tailwind utility
(spacing, flex, grid, typography sizing) exactly like built-in classes.

## Where the truth lives

- `styles.css` at the bundle root — the token/theme source; import closure
  covers `_ds_bundle.css` (compiled component styles).
- `tokens/` — the raw CSS custom properties (`--color-*`, `--radius`) this
  component's classes resolve to.
- `components/general/<Name>/<Name>.prompt.md` — per-component usage notes
  and prop reference.

## Build snippet

```tsx
import { Button, Card, CardHeader, CardTitle, CardDescription, Badge } from "ai-course-frontend-ui";

function StudentCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>王晓明</CardTitle>
        <CardDescription>student@example.com</CardDescription>
      </CardHeader>
      <div className="flex gap-2">
        <Badge variant="muted">S4</Badge>
        <Badge variant="success">在读</Badge>
      </div>
      <Button variant="primary" className="mt-3">
        查看详情
      </Button>
    </Card>
  );
}
```

Compose new layout with plain Tailwind utilities (`flex`, `gap-*`, `max-w-*`)
around these components — the system does not ship layout primitives, only
the 7 components above.
