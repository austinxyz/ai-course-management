"use client"; // Error boundaries must be Client Components

import { Button, Card } from "@/components/ui";

interface RootErrorProps {
  error: Error & { digest?: string };
  /**
   * Re-fetches and re-renders the segment. Deliberately not `reset` — that one
   * re-renders the children *without* re-fetching, so a failure caused by data
   * would survive the retry unchanged.
   */
  unstable_retry: () => void;
}

/**
 * The last stop, below the root layout.
 *
 * `app/(app)/error.tsx` renders inside the shell layout and therefore cannot
 * catch that layout throwing; and the pages outside the shell (`/`,
 * `/style-guide`) have no boundary above them at all. Both land here.
 *
 * The copy stays vague on purpose: unlike the shell's boundary, this one has no
 * idea what failed, and guessing "服务器可能正在唤醒" would be a claim we cannot
 * support — the root layout does not touch the backend.
 */
export default function RootError({ unstable_retry }: RootErrorProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
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

        <h1 className="m-0 mb-1.5 font-sans text-[15px] font-semibold">页面出错了</h1>

        <p className="m-0 mb-4 font-sans text-[13px] leading-[1.7] text-muted">
          这一页没能渲染出来。点击重试；若反复出现，请把当前网址一并反馈。
        </p>

        <Button variant="primary" onClick={() => unstable_retry()}>
          重试
        </Button>
      </Card>
    </div>
  );
}
