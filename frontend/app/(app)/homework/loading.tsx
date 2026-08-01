import { Card } from "@/components/ui";

/**
 * 作业页取两条数（名单 + 上次导入），且后端是 Render 免费档、会休眠。
 * 没有这一屏的话，冷启动那一分钟里页面完全空白——与"坏了"看不出区别。
 */
export default function HomeworkLoading() {
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
          正在加载作业数据…
        </h1>

        {/* 把可能的等待时间**说出来**：光写「加载中」的话，二十秒后读起来就是
            卡死了，而刷新会把正在进行的冷启动丢掉、从头再来一次。 */}
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
