## Context

`nudge_events` 表（`student_email`/`course_id`/`event_type`/`channel`/`note`/`created_at`）已经承载了全部需要展示的数据——`nudge` 能力的 design.md 早就说明这张表设计上能长成完整的互动记录能力。本变更不新增任何写路径，纯粹是在这张表上加一层聚合读视图。

`students` 页已经有一个现成的先例可以照抄：`page.tsx`（Server Component）一次性 `getEnrollments()` 拿到全部报课记录，`StudentsClient.tsx` 按 `e.studentEmail === selected.email` 客户端过滤后传给 `DetailPanel`——不是每次选中学员再发一次请求。当前规模下（~10 个学员）这个模式足够，本变更沿用同一套。

`nudge` 页的 `formatAt()`（UTC → 美西时间格式化）和 `channelLabel()`（渠道中文化）目前是 `NudgeClient.tsx` 里的模块级函数，只有那个文件在用。本变更第二处要用到同样的格式化（互动记录页 + 学员详情卡片），需要先把它们挪到共享位置。

## Goals / Non-Goals

**Goals:**
- 后端只加只读端点，`nudge_events` 表结构完全不动
- 前端过滤（按学员、按时间范围）全部在客户端做，不给后端传筛选参数——数据一次性整体取回，跟 `enrollments` 同一个模式，这个规模下没有必要为筛选单独设计后端查询参数
- `formatAt`/`channelLabel` 只维护一份，从 `nudge` 挪到共享模块

**Non-Goals:**
- 不做分页——当前数据量级不需要
- 不做服务端过滤/搜索 API——客户端过滤足够

## Decisions

**1. 后端只加两个端点：`GET /api/interactions`（全量列表）+ `GET /api/interactions/count`（最近 7 天条数）。不做按学员/时间的服务端过滤参数。**

`GET /api/interactions` 一次性返回全部 `nudge_events`，JOIN `students`（拿姓名）+ `courses`（拿课程名），按 `created_at` 倒序。响应形状：

```python
class InteractionRead(BaseModel):
    student_email: str
    student_name: str
    course_id: uuid.UUID
    course_name: str
    event_type: str
    channel: str | None
    note: str
    at: datetime
```

`GET /api/interactions/count` 只返回一个数字——`created_at >= now - 7 days` 的行数，固定窗口，不接受参数（侧边栏徽标用，语义上就是"最近 7 天"，不是"当前筛选条件下"）。

不做服务端过滤参数的理由：筛选条件（学员/时间范围）会随讲师操作实时变化，如果后端做筛选就要么每次筛选都发一次请求（体验上不如客户端筛选跟手），要么前端自己缓存全量数据再本地过滤（等于绕过了后端筛选参数，白设计一套 API）。当前数据规模（几十到几百条历史记录）一次性传全量数据的成本可以忽略。

**2. 学员筛选下拉的选项从已加载的 `interactions` 列表里去重推出，不单独查询"哪些学员有过互动记录"。**

```typescript
const studentsWithInteractions = useMemo(
  () => [...new Map(interactions.map(i => [i.studentEmail, i.studentName])).values()],
  [interactions],
);
```

跟 `nudge` 页 `nudgedCount` 从 `history` 里客户端算出来是同一个思路——数据已经在内存里，没必要为一个派生视图再打一次接口。

**3. `formatAt()`/`channelLabel()` 从 `frontend/app/(app)/nudge/NudgeClient.tsx` 挪到 `frontend/lib/format.ts`（新文件），`nudge`/`interactions`/学员详情面板三处共用同一份实现。**

纯函数搬家，行为不变。`nudge/NudgeClient.tsx` 改成从 `@/lib/format` 导入，不再自己定义。

**4. `students` 页的 `page.tsx` 额外 `getInteractions()` 一次，按学员客户端过滤后 `.slice(0, 5)` 传给 `DetailPanel` 的"最近互动"卡片——跟 `enrollments` 现有模式完全一致，不新增数据流模式。**

**5. `nudge` 页"查看互动记录"链接跳转到 `/interactions?student=<email>`，`interactions/page.tsx`（Server Component）读 `searchParams.student` 作为初始筛选值传给 `InteractionsClient`，不是客户端路由跳转后再筛选——保证深链接可分享、可刷新。**

## Risks / Trade-offs

- **[风险] 全量拉取 `nudge_events` 且不分页**——数据量涨到几千条时这个模式会变慢 → 接受：单人使用、几个课程几十个学员的规模下，`nudge_events` 增长速度是"每次催一下加一行"，到几千条需要经年累月；真涨到那个量级再加分页/服务端过滤，不为假设的未来规模现在就多建一层不需要的复杂度。
- **[风险] `formatAt`/`channelLabel` 挪动位置是对 `nudge` 现有代码的改动，不是纯新增**——存在改坏 `nudge` 页既有行为的风险 → 接受：纯函数搬家 + 改 import，不改函数体，`nudge` 现有测试套件回归跑一遍就能确认没有破坏。

## Migration Plan

无数据库结构变更——`nudge_events` 表现状直接支持这次的全部只读查询。部署即生效，没有回滚顾虑（新增端点/新增页面，不改变任何既有行为，除了 `formatAt`/`channelLabel` 的搬家）。

## Open Questions

（无——explore 与本文档已定：两个只读端点、客户端过滤、格式化函数共享化、DetailPanel 复用 enrollments 同款数据流模式、深链接靠 URL query param。spec.md 里标了一处待人工确认的边界：从 nudge 页跳转互动记录时是否要带上课程维度的预筛选，目前范围内只按学员）
