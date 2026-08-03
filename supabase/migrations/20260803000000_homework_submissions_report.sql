-- 批改报告导入：逐分项评语 + "亮点/改进建议是否来自报告导入"的锁定标记。
-- 见 openspec/changes/homework-grading-report/design.md。
ALTER TABLE homework_submissions
  ADD COLUMN dimension_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN highlight_locked boolean NOT NULL DEFAULT false;
