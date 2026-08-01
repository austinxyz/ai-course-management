-- 网页导入 grades.csv 所需的两张表。纯新增，不动 homework_submissions。

-- 「不算作业的邮箱」。**全课程通用**。
--
-- 不挂在 students 上：被排除的人恰恰可能**不在**学员表里（讲师本人就是），
-- 挂上去等于要求先给他建档，而建档正是我们不想做的事——建了档，
-- 他的测试提交就会静默变成真实成绩。
--
-- 不按课程分：讲师的测试提交在哪门课都不该算。按课程分会让
-- "我上次是不是标过"变成一个要逐课回忆的问题。
create table homework_excluded_emails (
  email text primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- 每次**实际写入**的导入的元信息。dry-run 不写这里，
-- 否则"上次导入"会指向一次没发生的导入。
--
-- **不存上传文件的原文**：权威副本在 ai-course 仓库里，这里再存一份
-- 就多一份含真实姓名邮箱的副本要看管，而它不参与任何功能。
create table homework_imports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  filename text not null,
  encoding text not null,
  row_count int not null,
  created_count int not null,
  updated_count int not null,
  imported_at timestamptz not null default now()
);

-- 作业页只问一件事：这门课最近一次导入是什么时候。
create index homework_imports_course on homework_imports (course_id, imported_at desc);

-- 回填：讲师本人的邮箱进排除名单。
--
-- CLI 的 `--exclude` 随 tools/homework-sync/ 一起消失，不回填的话那条约束就断了。
-- 他的测试提交在 session1/grades.csv 里出现两次，两行的姓名列还不一样；
-- 它们目前不在库里的唯一原因是他不在学员表里——那是**巧合，不是排除**。
--
-- 注意：本地 `supabase db reset` 是空库重放，这条 insert 照样执行，
-- 但"它确实挡住了那两行"这件事不被任何本地测试覆盖，证据只能来自生产验收。
insert into homework_excluded_emails (email, note)
values ('austin.xyz@gmail.com', '讲师本人的测试提交')
on conflict (email) do nothing;
