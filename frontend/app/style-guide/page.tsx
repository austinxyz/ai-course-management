import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

const colorTokens = [
  ["background", "bg-background"],
  ["foreground", "bg-foreground"],
  ["surface", "bg-surface"],
  ["surface-muted", "bg-surface-muted"],
  ["border", "bg-border"],
  ["primary", "bg-primary"],
  ["muted", "bg-muted"],
  ["danger", "bg-danger"],
  ["success", "bg-success"],
] as const;

export default function StyleGuidePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Design System — Style Guide</h1>
        <p className="mt-1 text-sm text-muted">
          占位 token，等 claude.ai Design 出图后替换 app/globals.css 里的
          :root / .dark 变量值即可全站生效。
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Colors</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {colorTokens.map(([name, cls]) => (
            <div key={name} className="space-y-1">
              <div
                className={`h-12 rounded-token border border-border ${cls}`}
              />
              <div className="text-xs text-muted">{name}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Badges</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="muted">Muted</Badge>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Input</h2>
        <div className="max-w-sm">
          <Input placeholder="学员邮箱" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Card</h2>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>学员姓名</CardTitle>
            <CardDescription>student@example.com</CardDescription>
          </CardHeader>
          <div className="flex gap-2">
            <Badge variant="muted">S4</Badge>
            <Badge variant="success">在读</Badge>
          </div>
        </Card>
      </section>
    </main>
  );
}
