-- 讲师手动标记「已回复」，独立于 grades.csv 的 reply_status 列，
-- 重新导入不清空。见 openspec/changes/homework-reply-status/design.md。
ALTER TABLE homework_submissions
  ADD COLUMN replied boolean NOT NULL DEFAULT false,
  ADD COLUMN replied_at timestamptz;
