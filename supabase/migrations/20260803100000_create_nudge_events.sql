-- 催作业产生的最小互动事件记录。event_type 不建 CHECK 约束——给将来长成完整
-- 「互动记录」能力（人工录入、参与度信号）留口子，仿 homework_submissions.source 的先例。
-- 见 openspec/changes/nudge/design.md。
create table nudge_events (
  id uuid primary key default gen_random_uuid(),
  student_email text not null references students(email),
  course_id uuid not null references courses(id),
  event_type text not null,
  channel text,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index nudge_events_student_course_idx on nudge_events (student_email, course_id, created_at desc);
