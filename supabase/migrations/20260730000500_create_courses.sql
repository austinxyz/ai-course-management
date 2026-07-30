-- 课程、平台别名、场次。报课的前置：一条报课记录要先匹配到某门课，再挂到某一场。
-- 纯新增，不改 students。回滚（本项目无 down migration 机制，人工执行）：
--   drop table course_sessions, course_aliases, courses;

create table courses (
  id uuid primary key default gen_random_uuid(),
  -- 主键与课程名、简称都无关，因为两者都会改：设计里明写「课程名改了要同步平台别名」，
  -- 而简称可留空。名字当主键就等于禁止改名。
  name text not null,
  short text not null default '',
  tagline text not null default '',          -- 一句话定位，列表与卡片上显示
  intro text not null default '',            -- 招生与答疑用的完整说明
  hours int not null default 2,              -- 每场时长，课程级默认
  homework_title text not null default '',   -- 作业题目；截止日期按场次定，故不在此
  offline boolean not null default false,    -- 上架 / 已下线。课程没有删除
  created_at timestamptz not null default now()
);

create table course_aliases (
  -- 主键就是归一化后的别名（去首尾空白 + 转小写）：全库唯一由结构保证，
  -- 应用层不需要"先查一遍再写"。同源做法见 students_email_lower_key。
  -- 别名的唯一用途是消除导入歧义，所以 S1 不能同时指向两门课。
  alias text primary key,
  -- 用户当初的写法，仅用于显示（`Session 1` 比 `session 1` 好读）。匹配只看 alias。
  raw text not null,
  course_id uuid not null references courses (id) on delete cascade
);

create table course_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  -- 墙上时间 + 时区名，不存 UTC 偏移小时数。讲师说的"美西晚 7:30"在夏令时前后
  -- 都是 7:30；存 -8 会让 11 月第一个周日之后所有场次错一小时，
  -- 且错的方向对每个时区不同。绝对时刻是派生物，读取时用 zoneinfo 算，不入库。
  local_date date not null,
  local_time time not null,
  tz text not null default 'America/Los_Angeles',
  -- 讲师按场次记：同一门课的不同场次可以是不同的人。
  teacher text not null,
  -- null = 跟随日期（未到为 pending、已过为 done）。非空则为人工覆盖，
  -- 取值 pending / done / cancelled。一个 state 列表达不了"跟随日期"这第三种状态。
  state_override text,
  note text not null default '',             -- 这一场为什么开：加场 / 时区 / 合作方专场
  created_at timestamptz not null default now()
);

create index course_sessions_course_date_idx on course_sessions (course_id, local_date);
