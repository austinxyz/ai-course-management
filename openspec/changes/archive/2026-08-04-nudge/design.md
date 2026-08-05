## Context

`homework.py::list_homework` 已经算出四态（`submitted`/`missing`/`not_open`/`no_session`），`missing` 就是"该催"的判据。`merge_states`/`state_of` 是模块级纯函数（未加下划线私有前缀，`homework.py` 内已有跨路由导入 `courses.py::derive_session_state` 的先例），可以直接从 `nudge.py` 导入复用，不重新发明。

`enrollment` 能力的 `GET /api/enrollments` 与 `homework` 能力的 `GET /api/homework` 都遵循"一条 JOIN 取全，不逐人二次查询"的纪律（每次数据库往返实测 ≈ 61-64ms，Render → Supabase）。本变更延续同一套约束。

`nudge_events` 是全新表，没有历史数据要迁移。

## Goals / Non-Goals

**Goals:**
- 名单查询复用 `homework.py` 的状态判定，不重复实现
- 名单 + 统计（已催次数/上次催促时间）+ 催促历史，一次请求取全，选中某人不触发新的网络请求
- 渠道自动判定，不引入新的用户输入

**Non-Goals:**
- 不做真实发信（见 proposal Out of Scope）
- 不做批量操作
- 不做完整互动记录的人工录入/参与度导入入口

## Decisions

**1. 名单查询复用 `homework.py` 的 `merge_states`/`state_of`，按学员去重，取最早场次日期。**

```python
from app.routers.homework import merge_states, state_of, MISSING, SUBMITTED
```

查询结构与 `list_homework` 一致：`Enrollment ⋈ Student ⋈ CourseSession` 外连接，`outerjoin HomeworkSubmission`（判断是否已交），按 `student_email` 分组，取该生这门课全部报课记录里 `state_of(session_row)` 的**最宽容值**（与 `merge_states` 同一逻辑）；只保留合并结果为 `MISSING` 的人。逾期天数取该生这门课全部"未交"报课记录里**最早**的场次日期与今天的天数差（对应 spec 的"多条未交记录只算一条，取最早日期"决定）。

备选：直接调用 `GET /api/homework?course=` 拿到的名单再在 Python 里过滤 `state == "missing"`。放弃——那是一次额外的 HTTP 往返（`nudge.py` 调 `homework.py` 的路由函数当库函数用是可以的，调它暴露的 HTTP 端点不行），而且拿不到"多条报课记录各自的场次日期"这种要在 SQL 层面聚合的信息。

**2. 新表 `nudge_events`：只记催作业产生的事件，字段为将来扩展留口子但这次只用两种类型。**

```sql
create table nudge_events (
  id uuid primary key default gen_random_uuid(),
  student_email text not null references students(email),
  course_id uuid not null references courses(id),
  event_type text not null,  -- 'nudged' | 'skipped'（应用层校验，不建 CHECK，理由同 homework 的 source 字段——给未来的第三类事件留口子）
  channel text,               -- 'email' | 'wechat'，只在 event_type='nudged' 时有意义
  note text not null default '',
  created_at timestamptz not null default now()
);
create index nudge_events_student_course_idx on nudge_events (student_email, course_id, created_at desc);
```

不建外键到 `enrollments`（一条报课可能被改场次、删除，但事件记录要独立于报课记录的生命周期长期保留——与 `homework_submissions` 不外键到 `enrollments` 同一个理由）。

**3. `GET /api/nudge?course=` 一次返回名单 + 统计 + 每人的完整催促历史（`json_agg` 子查询），不为选中某人再发一次请求。**

```python
history_json = (
    select(func.json_agg(func.json_build_object(
        "type", NudgeEvent.event_type, "channel", NudgeEvent.channel,
        "note", NudgeEvent.note, "at", NudgeEvent.created_at,
    ).op("ORDER BY")(NudgeEvent.created_at.desc())))
    .where(NudgeEvent.student_email == Enrollment.student_email, NudgeEvent.course_id == Enrollment.course_id)
    .scalar_subquery()
)
```

响应体每人带 `history: [{type, channel, note, at}]`（按时间倒序），前端从 `history` 里过滤 `type == "nudged"` 算次数、取第一条的 `at` 当"上次催促时间"，不需要后端另算这两个值。

备选：后端预先算好 `nudged_count`/`last_nudged_at` 两个标量字段。放弃——`history` 数组本身就够推出这两个值，多算两个字段是重复信息，且前端详情面板本来就要展示完整历史，不如让前端从同一份数据里派生，减少后端要维护的字段数。

**4. 跳过通过"存在一条 `event_type='skipped'` 且发生在该生这门课当前处于 missing 状态期间"来过滤，不修改任何既有数据。**

简化实现：只要该（学员, 课程）对存在**任意一条** `skipped` 事件，就从名单里排除。不做"skip 之后又有新事件所以失效"的复杂状态机——spec 里已经写明这是已知的边界简化（`homework_submissions` 没有删除入口，"先交后又变回未交"这种情形本来就极罕见）。

**5. 草稿文本在前端渲染，不新增后端模板端点。**

`GET /api/nudge` 返回的字段（姓名、课程名、逾期天数）已经足够拼出固定模板；`NudgeClient.tsx` 里一个纯函数 `draftFor(person)` 现算现拼，编辑草稿是纯前端 state，不回写后端。

备选：后端提供 `GET /api/nudge/draft?student=&course=`。放弃——模板固定、变量都已经在名单响应里，多一个端点没有对应的往返收益。

## Risks / Trade-offs

- **[风险] `merge_states`/`state_of` 是 `homework.py` 里没有下划线前缀但也没有显式导出的模块级函数，属于"事实上公开"而非"设计上公开"** → 缓解：不改这两个函数的签名/行为，只读不改；`homework.py` 本身已有跨路由导入 `courses.py` 函数的先例，这不是新引入的耦合模式。
- **[风险] `history` 用 `json_agg` 子查询嵌进主查询，报课记录多的课程理论上单条 SQL 会变复杂** → 接受：跟 `homework.py` 满分子查询（`jsonb_object_agg`）同一个数量级，实测课程规模（单课 ≤ 30 人）不构成性能问题。
- **[风险] 逾期天数按美西时区"今天"计算，`local_date` 是 date 类型不带时区** → 缓解：与 `enrollment`/`homework` 能力现有的日期比较方式一致，不新增一套时区逻辑。

## Migration Plan

新增 `nudge_events` 表，无历史数据，无需回填。部署后立即可用——讲师第一次点"标记已催"/"跳过"才会产生数据，之前的行为不受影响。回滚：`DROP TABLE nudge_events`，安全，没有其他表外键指向它。

## Open Questions

（无——探索阶段与本文档已定：状态判定复用 homework 能力、按人+课去重取最早场次日期、渠道自动判定、跳过用"存在即排除"简化、草稿前端渲染）
