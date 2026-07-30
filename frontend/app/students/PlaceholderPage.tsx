import { Badge, Button, Card } from "@/components/ui";
import { PAGES } from "./vocab";
import type { NavKey } from "./types";

interface PlaceholderPageProps {
  view: Exclude<NavKey, "students">;
  onBackToStudents: () => void;
}

export function PlaceholderPage({ view, onBackToStudents }: PlaceholderPageProps) {
  const page = PAGES[view];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-none items-end justify-between gap-5 border-b border-border bg-surface px-[22px] pb-3.5 pt-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 font-sans text-[19px] font-semibold tracking-tight">{page.title}</h1>
            <Badge variant="muted">未开始设计</Badge>
          </div>
          <p className="m-0 font-sans text-[12.5px] text-muted">{page.desc}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3.5 overflow-auto bg-background p-[22px]">
        <Card className="max-w-[640px]">
          <div className="mb-3 flex flex-col gap-1">
            <h3 className="m-0 font-sans text-sm font-semibold">{page.cardTitle}</h3>
            <p className="m-0 font-sans text-[13px] leading-relaxed text-muted">{page.cardDesc}</p>
          </div>
          <div className="mb-3.5 flex flex-col gap-2">
            {page.bullets.map((text) => (
              <div key={text} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-[5px] w-[5px] flex-none rounded-full bg-muted-foreground" />
                <span className="font-sans text-[12.5px] leading-relaxed text-foreground">{text}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={onBackToStudents}>
            返回学员名单
          </Button>
        </Card>
        <div className="grid max-w-[640px] grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          <div className="h-24 rounded-token border border-dashed border-border bg-surface-muted/60" />
          <div className="h-24 rounded-token border border-dashed border-border bg-surface-muted/60" />
        </div>
      </div>
    </div>
  );
}
