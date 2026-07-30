import { Card } from "@/components/ui";

export default function CoursesLoading() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto bg-background p-6">
      <Card className="w-[420px] max-w-full">
        <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-token border border-border bg-surface-muted">
          <div className="flex items-center gap-[5px]" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:200ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:400ms]" />
          </div>
        </div>

        <h1 className="m-0 mb-1.5 font-sans text-[15px] font-semibold">
          正在加载课程数据…
        </h1>

        {/* Naming the likely wait up front is the point: a bare "加载中" reads as
            frozen after ~20s, and refreshing discards the cold start underway.
            Without this file at all the previous page simply stayed put. */}
        <p
          data-testid="loading-body"
          className="m-0 font-sans text-[13px] leading-[1.7] text-muted"
        >
          若服务器处于休眠状态，首次唤醒约需 1 分钟。请保持页面打开，不必刷新。
        </p>
      </Card>
    </div>
  );
}
