"use client"; // Error boundaries must be Client Components

import { Button, Card } from "@/components/ui";

interface AppErrorProps {
  error: Error & { digest?: string };
  /**
   * Re-fetches and re-renders the segment. Deliberately not `reset` — that one
   * re-renders the children *without* re-fetching, so the user would click
   * "重试" and land right back on this card. Only a re-fetch can pick up a
   * backend that has woken up since the failure.
   */
  unstable_retry: () => void;
}

export default function AppError({ unstable_retry }: AppErrorProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto bg-background p-6">
      <Card className="w-[420px] max-w-full">
        <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-token border border-danger-border bg-danger-surface">
          <svg
            viewBox="0 0 16 16"
            width="17"
            height="17"
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 5v3.6M8 10.8v.2" />
          </svg>
        </div>

        <h1 className="m-0 mb-1.5 font-sans text-[15px] font-semibold">
          暂时无法加载数据
        </h1>

        {/* Copy must hold whether the backend is merely waking or genuinely
            broken — the frontend cannot tell the two apart. */}
        <p
          data-testid="error-body"
          className="m-0 mb-4 font-sans text-[13px] leading-[1.7] text-muted"
        >
          服务器可能正在唤醒——免费套餐休眠后，首次访问约需 1 分钟。
          也可能是网络或服务异常。稍等片刻后点击重试。
        </p>

        <Button variant="primary" onClick={() => unstable_retry()}>
          重试
        </Button>
      </Card>
    </div>
  );
}
