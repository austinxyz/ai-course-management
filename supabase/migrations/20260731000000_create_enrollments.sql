-- 报课：把学员挂到课程，可以指明上哪一场。
--
-- 学员用邮箱引用（students 的主键就是邮箱）；课程与场次用各自的 uuid。
-- 不存课程名：课程名是可改的，存名字会让改名把历史报课改坏。平台课程名 → course_id
-- 的别名解析发生在导入层，落库时已经是外键。
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_email text not null references students (email) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,

  -- 可空 = "报了这门课，但还没定上哪一场"。平台数据常常不给场次，
  -- 而这是一个需要跟进的真实状态，不是缺陷。
  --
  -- 故意不写 on delete cascade / set null：级联会让删场次静默带走报课，
  -- 置空会静默把一批人推进待跟进状态而讲师毫不知情。默认的 no action
  -- 恰好就是"有引用就拒绝"，与应用层的守卫同向——即便有人绕过 API 直删，
  -- 也不会悄悄毁数据。
  session_id uuid references course_sessions (id),

  enrolled_at date not null,

  -- 只存需要人决定的两种。"已完成"不入库，读取时由所属场次派生——
  -- 没有人会在每次课后回来把十几条记录挨个改成已完成，存下来的状态会腐烂。
  status text not null default 'enrolled',   -- enrolled | withdrawn

  -- 本切片只会写 manual；列现在就建，批量导入那一片不该改表结构。
  source text not null default 'manual',     -- manual | platform

  note text not null default '',
  created_at timestamptz not null default now()
);

-- 唯一性拆成两条，各自带条件。
--
-- 写成一条 (student_email, course_id, session_id) 是不够的：Postgres 里
-- NULL 互不相等，两条"未定场次"的记录都会被收下且互不冲突——索引建了却没挡住，
-- 而它们表示的是同一件事（批量导入时每导一次就多一条）。
create unique index enrollments_unique_session
  on enrollments (student_email, course_id, session_id)
  where session_id is not null;

create unique index enrollments_unique_undecided
  on enrollments (student_email, course_id)
  where session_id is null;

-- 读路径：按学员看他的报课，按场次数人数。
create index enrollments_by_student on enrollments (student_email);
create index enrollments_by_course_session on enrollments (course_id, session_id);
