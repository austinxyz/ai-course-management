## Context

系统目前只有 `students` 一张表与一个页面（`/students`）。侧栏的六个入口不是路由 ——
`StudentsClient` 用 `view` state 切换，非 `students` 的分支渲染 `PlaceholderPage`
（[Sidebar.tsx](../../../frontend/app/students/Sidebar.tsx) 的 `onNavigate` 就是 `setView`）。

设计基准：`docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html`
（课程页在 `sc-if isCourses` 分支，课程弹窗在 `sc-if showCourse`）。

本 change 要落三件事：三张新表、课程页与弹窗、以及跨时区时间的正确性。

## Goals / Non-Goals

**Goals:**

- 课程与场次可增删改，别名唯一性由结构保证而非靠应用层检查
- 夏令时不会让已排场次的时间显示出错，且**这件事有自动化测试**
- 状态"默认跟随日期 + 可人工覆盖 + 可恢复跟随"三态可表达

**Non-Goals:**

- 报课、已报人数、导入链路
- 讲师实体化
- 把既有的中文枚举列改成英文 key

## Decisions

### 1. 别名的规范化形式就是主键

```sql
create table course_aliases (
  alias     text primary key,            -- normalize(去空白+转小写) 后的值
  raw       text not null,               -- 用户输入的原样写法，仅用于显示
  course_id uuid not null references courses(id) on delete cascade
);
```

主键即全局唯一，`S1` 与 ` s1 ` 撞在同一行上 —— 唯一性由数据库结构保证，
不需要应用层查一遍再写。这与 `students` 表用 `lower(email)` 唯一索引同源：
归一化放在边界，别把"两个键指同一个人/同一门课"的可能性留在库里。

`raw` 单独存是因为界面要显示用户当初的写法（`Session 1` 比 `session 1` 好读），
而匹配只看 `alias`。

**代价**：改一个别名的归属要 delete + insert，不能 update 主键。别名是小对象，接受。

### 2. 场次存"墙上时间 + 时区名"，但 API 额外返回绝对时刻

```sql
create table course_sessions (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  local_date date not null,                       -- 美西当地日期
  local_time time not null,                       -- 美西当地时间
  tz         text not null default 'America/Los_Angeles',
  teacher    text not null,
  state_override text,                            -- null = 跟随日期
  note       text not null default ''
);
```

存墙上时间的理由在 requirements 里：讲师说的"美西晚 7:30"在夏令时前后都是 7:30。

但"墙上时间 + 时区名 → 绝对时刻"这步换算，**在 Python 里做，不在浏览器里做**：
`zoneinfo` 一行搞定且精确，而 JS 没有原生的"给定时区的墙上时间求 UTC 时刻"API，
通用做法是拿 `Intl` 试探偏移再迭代修正 —— 那是本 change 最容易写错的一段代码，
不该放在两处（前端换算 + 后端测试）各写一遍。

因此 `GET` 响应里每个场次带三样东西：

- `local_date` / `local_time` / `tz` —— 编辑表单用
- `starts_at`（带时区的绝对时刻）—— 由 `zoneinfo` 在**读取时**算出
- 派生的 `state`

前端只做一件事：把 `starts_at` 用 `Intl.DateTimeFormat({ timeZone })` 格式化成各时区那几行。
格式化一个已知时刻是 JS 的强项，不会算错。

**为什么在读取时算而不是写入时存一列 `starts_at`**：存下来就冻结了当时的时区规则。
时区规则会变（各国改夏令时政策是常事），墙上时间才是讲师的意图，绝对时刻是派生物。
派生物不入库。

### 3. 状态在后端派生，`state_override` 为 null 表示跟随

响应里给两个字段：

- `state` —— 最终状态（`pending` / `done` / `cancelled`）
- `state_is_override` —— 布尔，界面据此显示「跟随日期」还是「恢复跟随日期」

派生规则：`state_override` 非空则用它；否则比较 `local_date` 与
`datetime.now(ZoneInfo("America/Los_Angeles")).date()`，早于今天为 `done`，否则 `pending`。

**"今天"取美西日期**，不取服务器时区（Render 上是 UTC）。UTC 已跨日、美西未跨日时，
按服务器日期算会把今晚的课提前标成"已上"。

**已知的滞后**：页面是 Server Component 每次请求取数，因此状态在美西跨日后的第一次请求就更新。
不做定时刷新 —— 这是内部工具，状态本身也不驱动任何自动动作。

### 4. 课程页是独立路由 `/courses`，侧栏改成链接

现状侧栏是 `onNavigate → setView`，整站只有 `/students` 一个数据页。课程页如果也做成
`StudentsClient` 里的一个分支，那个组件会同时持有学员与课程两套数据与状态，
且课程数据得由学员页的 Server Component 一起取 —— 打开学员名单要顺带查课程表。

因此：`/courses` 独立路由、自己的 `page.tsx` 与 Server Component 取数，
`Sidebar` 的 `<button onClick>` 改成 `next/link` 的 `<Link>`，`view` 由当前路径决定。

**影响面**：`Sidebar` 的 props 从 `(view, onNavigate)` 变成 `(active)`；
`StudentsClient` 不再持有 `view` state；占位页从 `StudentsClient` 的分支变成各自的路由
（`/enroll`、`/homework`、`/nudge`、`/interactions` 都渲染 `PlaceholderPage`）。
这是本 change 里唯一会碰到既有代码的部分，独立成一个 task group，先做、单独提交，
免得和课程功能混在一起。

**为什么现在做而不是以后**：报课页是下一个 change，届时同样要一个页面；
现在不改，下一个 change 会在两个分支里各塞一套。

### 5. 前端结构照 students 的既有模式

```
frontend/app/courses/
  page.tsx          Server Component，取课程 + 场次
  CoursesClient.tsx 客户端组件，只渲染 props（不持有数据副本）
  CourseModal.tsx   新建/编辑课程弹窗
  SessionRows.tsx   场次列表与行内编辑
  actions.ts        Server Actions，每个内部独立校验 site password
```

沿用 student-write 立下的三条：Server Action 内部独立鉴权（不押注 `proxy.ts` 单点）；
每个字段独立的保存中/失败态，失败保留用户输入；预期内的失败用返回值表达，不抛异常
（生产构建会抹掉 Server Action 抛出的错误信息）。

### 6. 枚举校验沿用既有分工

写请求体用 Pydantic `Literal`（`state_override`、`hours`），只读响应用 `str`。
理由是 pitfalls 里那条：响应上用 `Literal` 时，任何一行落在枚举外会让整个列表接口 500，
而不是那一行出错。

## Risks / Trade-offs

- **[夏令时换算写错而测试也写错]** → 这是本 change 最大的风险，requirements 里已经踩过一次：
  拿美西 vs 美东比毫无意义（同日切换，恒差 3 小时）。测试必须拿**上海**比
  （中国不用夏令时，时差在 15/16 小时之间跳）：10 月与 12 月两场同为美西 19:30，
  断言上海分别为次日 10:30 与 11:30。断言写死具体值，不写"两者不同"。
- **[`state` 派生依赖"今天"，测试会随时间腐坏]** → 测试不用真实当天：
  构造两场相对固定基准日的场次，通过注入可控的"今天"来断言。
  实现上把取今天的函数单独拿出来（`_today_pt()`），测试替换它。
  直接用 `date.today()` 写死断言的测试会在某天突然变红。
- **[侧栏改路由触碰既有页面]** → 单独一个 task group、单独提交，且该组只改导航不加功能，
  回归面看得清。既有 `StudentsClient` 测试若断言了 `view` 切换，要一并改。
- **[`course_aliases` 主键是归一化值，用户看到的是 `raw`]** → 若两次输入 `S1` 与 `s1`，
  第二次会命中同一主键。行为定为：视为重复，不覆盖 `raw`（先到先得），并告知用户已存在。
- **[课程无删除，误建的课程会永久留着]** → 与 `students` 无硬删除同源的取舍。
  已下线课程仍列出，只是带标记。真要清理只能直连数据库。

## Migration Plan

一个新 migration 文件：`supabase/migrations/<ts>_create_courses.sql`，内容为三张表
（`courses`、`course_aliases`、`course_sessions`）与外键。**纯新增，不改动 `students`**。

- **回滚**：三张表都是新表且无外部引用，回滚 = 手写一条 `drop table course_sessions, course_aliases, courses;`。
  本项目不用 Alembic、没有 down migration 机制，回滚是人工操作，因此该语句写进 change 的 tasks 里备用。
- **顺序**：DB migration 由 `.github/workflows/db-migrate.yml` 在 push 后自动 `supabase db push`，
  后端与前端由平台自动部署。三者的安全顺序是 **DB → 后端 → 前端**：
  表不存在时后端启动仍然正常（SQLModel 不在启动时校验表），但接口会 500；
  前端先上则课程页整页错误态。若同一次 push，push 后先确认 migration workflow 绿了再验收页面。
- **本地**：`supabase db reset` 重放三条既有 migration + 本次新增。
  重放后**必须重启后端进程**（连接池会全废、进程仍在监听，见 pitfalls）。

## Open Questions

（无阻塞项。以下为已定但值得复述的边界：）

- 课程列表不规定排序（课程数量少）；场次按 `local_date` 升序
- 「已报 N 人」不显示，等报课 change
- 场次可硬删除；**报课 change 必须补上"删除已有报课的场次要被拒绝"**
