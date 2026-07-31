-- 作业提交：`ai-course/tools/homework-grader/session*/grades.csv` 的只读镜像。
--
-- 权威副本永远是那些 csv。这张表可以整个 drop 掉再重新同步出来——
-- 这也是为什么回滚是完全的：不会丢任何只存在于这里的东西。
create table homework_submissions (
  id uuid primary key default gen_random_uuid(),

  -- 学员用邮箱引用（students 的主键就是邮箱）。
  student_email text not null references students (email) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,

  -- 有意**不存** session_id。作业属于「这个人 + 这门课」，与他上哪一场无关：
  -- 一个人可能重复听同一门课因而有两条报课，但只欠一份作业
  -- （enrollment spec 的「作业按人计，不按报课记录计」）。
  -- 存了场次就立刻产生一个无法回答的问题：这份作业算哪一场的？

  submitted_at date not null,

  -- 原样取自源文件的「总分」列，**不由分项求和推导**。
  -- session2/grades.csv 里真实存在一行「总分 ≠ 分项之和」，现算会与源文件
  -- 悄悄不一致，而这种不一致没有任何征兆。
  total int not null,

  -- 分项评分。**数组，不是对象** —— Postgres 的 jsonb 不保证对象键顺序
  -- （存储时按键长度、再按字节序重排），而列的先后顺序是评分表分组结构的
  -- 唯一载体（A 工作流 / B 提示词 / C 输出 / D 心得）。
  -- 形如 [{"item": "A1工作流结构", "score": 11}, …]。
  --
  -- 各课的分项列零交集，整列存进这里，所以新增一门课只是多一套 item 名，
  -- 不需要改表结构。
  scores jsonb not null default '[]'::jsonb,

  highlight text not null default '',
  improve text not null default '',

  -- 原样存源文件的值（实测出现过「待回复」「草稿已创建」），不归一化。
  reply_status text not null default '',

  -- 这条记录来自哪个文件的第几行，形如 "session1/grades.csv:7"。
  -- 页面上要显示——出了问题得能回到源头去核。
  source_ref text not null default '',

  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 唯一键不含场次。见上面 session_id 那段注释。
create unique index homework_submissions_unique_person_course
  on homework_submissions (student_email, course_id);

-- 读接口总是按课程取整门课的名单。
create index homework_submissions_course on homework_submissions (course_id);
