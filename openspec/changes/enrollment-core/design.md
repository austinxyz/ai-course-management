## Context

两条能力已上线且互不相干：`student-roster`（`students`，主键 `email`）与
`course-catalog`（`courses` / `course_aliases` / `course_sessions`，均为 uuid 主键）。
没有任何表把二者连起来。

场次目前是硬删除（`DELETE /api/courses/{id}/sessions/{sid}`），`course-catalog` 归档时
记下"没有报课表所以无害，有了之后要拒绝"。

设计基准：`docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html`
的学员详情报课区块（357–379 行）、`showManual` 弹窗、场次卡片的 `{{ s.enrolled }}`（511 行）。

本版 Next 是 16.2.12，本版约定见 `frontend/AGENTS.md`（先读 `node_modules/next/dist/docs/`）。

## Goals / Non-Goals

**Goals:**

- `enrollments` 表 + 读写接口
- 状态不会腐烂：只存人决定的部分
- 学员详情的报课区块 + 手工补录
- 课程页的已报人数与"未定场次"提示
- 场次删除守卫

**Non-Goals:**

- 批量导入、报课总表页、待处理队列（`enrollment-import`）
- 作业 / 催作业 / 出勤 / 收费 / 名额
- 批量改派场次

## Decisions

### 1. 表结构：外键指向实体，不存名字

```sql
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_email text not null references students (email) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  session_id uuid references course_sessions (id),   -- 可空；无 on delete，靠应用层守卫
  enrolled_at date not null,
  status text not null default 'enrolled',           -- enrolled | withdrawn
  source text not null default 'manual',             -- manual | platform
  note text not null default ''
);
```

**不存 `course_name`。** 设计稿字段契约里的 `course_name` 是**导入格式**的字段
（"平台课程名原样保留，本系统做别名映射"），别名 → `course_id` 的解析发生在导入层（切片 2）。
存名字会让改课程名把历史报课改坏，而课程名是明确可改的。

`session_id` **故意不写 `on delete cascade` 也不写 `set null`**：级联会让删场次静默带走报课，
置空会静默把人推进待跟进状态。守卫写在应用层，DB 的默认行为（`no action`）恰好是
"有引用就拒绝"，与我们要的一致 —— 即便有人绕过 API 直删，也不会悄悄毁数据。

`source` 列现在就建，虽然本切片只会写 `manual`：切片 2 不该改表结构。

### 2. 两条唯一索引，第二条是 partial

```sql
create unique index enrollments_unique_session
  on enrollments (student_email, course_id, session_id)
  where session_id is not null;

create unique index enrollments_unique_undecided
  on enrollments (student_email, course_id)
  where session_id is null;
```

第一条如果不加 `where`，`NULL` 行会被它"收下"但因 `NULL != NULL` 而互不冲突 ——
索引建了却没挡住，是那种**看起来做了事**的失败。所以拆成两条，各自的条件写明。

**这条必须用真实重复插入验证**，不能只看 migration 跑通。

### 3. 状态派生放在后端读取时，不落库

`GET` 返回的每条报课带一个**派生的** `state`：

```
withdrawn                        → withdrawn
session_id is null               → enrolled
所属场次 state == cancelled      → enrolled
所属场次 state == done           → completed
否则                             → enrolled
```

场次的 `state` 本身已经是派生的（`state_override` 为空即跟随日期，"今天"取
`America/Los_Angeles`）。报课状态复用它，而不是自己再算一遍日期 ——
两处各算一遍必然会在某个边界上分叉。

**前端不参与派生**：它只渲染后端给的 `state`。理由与课程排序那次相同 ——
可以由客户端算出来的东西，就不是数据的属性。

### 4. 已报人数：跟着课程一起返回，不新开端点

`GET /api/courses` 已经把场次一次取回内存归拢（避免 N+1）。已报人数在同一次请求里
按 `(course_id, session_id)` 聚合一次即可，随 `CourseRead` 一起返回；
"未定场次人数"按 `course_id` 聚合 `session_id is null` 的条数。

**替代方案**（未采用）：前端拿到报课列表自己数。那要求前端先拉全量报课，
而它只需要一个数字；且"数怎么算"会散落在两处。

### 5. 场次删除守卫返回 409 并带条数

沿用别名冲突那次的形状：409 + `detail` 里带可读信息（有几条报课挡着）。
前端 `describeDetail()` 已经能把 FastAPI 的 detail 渲染出来。

**错误信息必须渲染在触发它的那块界面上**（`course-catalog` group 6 那条 pitfall）：
删除按钮在场次行里，所以错误也显示在那一行，不能塞进课程弹窗的 state。

### 6. 前端：补录弹窗复用既有形状，不新造

学员详情的报课区块与 `showManual` 弹窗照设计稿做。表单字段：课程（必填，排除已下线）、
场次（可选，随所选课程联动）、报课日期（必填，默认今天）、备注。

**新建路径要把所有字段都送出去** —— `student-write` 那次的 pitfall：
新建时只送必填字段，弹窗收的其它字段被静默丢弃，而后端有默认值所以不报错。
验收脚本必须在"新建"那一步就填可选字段。

写入失败的信息按对象分开存（按报课 id，新增表单用 `new`），关闭只在成功回调里做，
写入期间禁用所有出口 —— 同 `course-catalog` group 6。

## Risks / Trade-offs

- **[partial unique index 没真正生效]** → 用真实重复插入验证，不是看 migration 跑通。
  `NULL != NULL` 是"索引建了但没挡住"的经典静默失败
- **[派生状态在前后端各算一遍]** → 前端只渲染后端给的 `state`，不自己判断日期
- **[删除守卫只在应用层]** → DB 外键默认 `no action` 恰好也是拒绝，两层一致；
  但错误信息只有应用层给得出，所以测试要覆盖"通过 API 删"这条路径
- **[补录表单丢字段]** → 验收脚本在新建那一步就填满所有字段（`student-write` 的教训）
- **[已报人数与未定场次人数口径分叉]** → 两者都在后端同一处聚合，前端不重算

## Migration Plan

一个 migration：建表 + 两条索引。**没有回填** —— 这是一张新表，历史报课数据在
EliteCoach101 平台上，导入是切片 2 的事。

上线顺序：后端先（新端点 + 场次删除守卫），前端后。中间态是"后端能拒绝删除、前端还没有报课区块"，
无害。回滚 = revert + drop table。

## Open Questions

（无阻塞项。以下为已定边界：）

- 报课挂课程、场次可空；不设状态覆盖
- 重听 = 两条记录；作业仍按人算一份
- 删场次一律拒绝（含退课记录）；不提供批量改派
- 归档不影响计数
- 无人报名的场次不显示数字；未定场次的人在课程上另计

**留给 apply 实测、不得默认成立**：partial unique index 在 `session_id is null` 上的实际行为。
