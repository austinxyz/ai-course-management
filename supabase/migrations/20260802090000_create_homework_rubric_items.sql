-- 各分项满分，讲师在课程页维护。独立于 homework_submissions.scores（那是
-- item+score 的 jsonb 数组）——满分是课程级配置，不该跟着每条提交重复存。
-- 见 openspec/changes/homework-rubric/design.md。
CREATE TABLE homework_rubric_items (
  course_id uuid NOT NULL REFERENCES courses(id),
  item text NOT NULL,
  max_score integer NOT NULL CHECK (max_score > 0),
  PRIMARY KEY (course_id, item)
);
