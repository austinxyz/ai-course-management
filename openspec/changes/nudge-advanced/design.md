## Context

`nudge` MVP 的 `GET /api/nudge?course=` 目前直接返回 `list[NudgePersonRead]`（裸数组），查询里已经用 `WHERE NOT EXISTS` 把"已跳过"的（学员, 课程）整个排除在结果集之外——这意味着已跳过的人**根本不在返回的行里**，没有任何一行数据能让前端推出"跳过了多少人"这件事。

`frontend/app/(app)/nudge/NudgeClient.tsx` 已有 `draftFor()` 纯函数生成默认草稿、`DetailPanel` 组件持有本地 `draft` state（`key={studentEmail}` 触发换人重新挂载复位）。

## Goals / Non-Goals

**Goals:**
- 三档模板选择、CSV 导出、进度指示三项完全在前端实现，不新增网络请求
- 已跳过人数在同一次页面加载里拿到，不做成"进入页面后再发一次请求才出现"的体验

**Non-Goals:**
- 不做真实发信（沿用 MVP 已定）
- 不做"模板内容可配置"——三档文案是代码里的固定字符串

## Decisions

**1. 三档模板是纯前端常量 + 一个按已催次数选默认档的纯函数，不新增后端字段。**

```typescript
const TEMPLATES = {
  first: (p, courseName) => `...`,
  second: (p, courseName) => `...`,
  final: (p, courseName) => `...`,
} as const;

function defaultTemplateKey(nudgedCount: number): keyof typeof TEMPLATES {
  if (nudgedCount === 0) return "first";
  if (nudgedCount === 1) return "second";
  return "final";
}
```

`DetailPanel` 新增一个 `templateKey` state（默认值 = `defaultTemplateKey(nudgedCount)`，随 `key={studentEmail}` 换人复位，同 MVP 已有的草稿复位机制）。切换 tab 时，若当前草稿等于**当前档位**的默认文案（即未被编辑过），才替换成新档位的默认文案；已编辑过的草稿切 tab 不动，避免"手滑点了个 tab 把讲师刚写的话冲掉"。

**2. CSV 导出是纯前端函数，用页面已加载的 `people` 数据拼字符串再触发浏览器下载，不发请求。**

```typescript
function toCsv(people: NudgePerson[]): string {
  const header = "姓名,邮箱,微信,逾期天数,已催次数";
  const rows = people.map(p => [p.name, p.studentEmail, p.wechat,
    p.overdueDays, p.history.filter(h => h.type === "nudged").length].join(","));
  return [header, ...rows].join("\n");
}
```

用 `Blob` + `URL.createObjectURL` + 隐藏 `<a download>` 触发下载，跟"复制文案"一样是纯客户端动作。字段含逗号/换行的情况（姓名理论上可能带逗号）用简单的双引号包裹处理，不引入额外依赖。

**3. 进度指示是静态三步 JSX，不依赖任何新数据——"起草文案"永远是当前态，"标记/跳过"永远是待办态，"算名单"永远是已完成态。**

不做成会变化的向导（比如某人标记完就跳到下一步高亮）——探索阶段没有要求这个交互深度，做成静态说明性元素即可，避免过度设计。

**4. `GET /api/nudge?course=` 的响应形状从裸数组改成 `{items, skipped_count}`，`skipped_count` 用一次额外的轻量 `COUNT(DISTINCT student_email)` 查询获得，不是零额外往返。**

```python
class NudgeListRead(BaseModel):
    items: list[NudgePersonRead]
    skipped_count: int
```

```python
skipped_count = session.exec(
    select(func.count(func.distinct(NudgeEvent.student_email))).where(
        NudgeEvent.course_id == course, NudgeEvent.event_type == "skipped",
    )
).one()
```

**这是对 requirements.md 里"不能为了这一个数字新增一次数据库往返"这句话的一处已知偏离**，在这里明确说明原因：已跳过的人完全不出现在主查询的结果行里（`WHERE NOT EXISTS` 把他们整个过滤掉了），要在同一条 SQL 里把"过滤掉的人数"当成结果集的一部分带出来，只有两种办法——(a) 把 `WHERE NOT EXISTS` 改写成 `LEFT JOIN` 保留这些行、在应用层再分组算跳过数，这会让主查询逻辑显著复杂化且违反"跳过是查询时排除"这条已有设计原则（`nudge` 能力 design.md 决定 4）；(b) 用一次独立、轻量、走索引的 `COUNT` 查询。选 (b)：这一次额外查询不是 per-row 也不是 per-person，是**课程级别的常数次**，跟 `homework.import_homework` 接受"三次成批查询"、`homework.list_homework` 用子查询嵌入满分表是同一个量级的判断——真正要守住的是"不随名单人数增长"，不是"字面意义上恰好一条 SQL"。`nudge_events` 已有的 `nudge_events_student_course_idx (student_email, course_id, created_at desc)` 领头列是 `student_email`，覆盖不到这次按 `(course_id, event_type)` 过滤的查询——发现于 group-1 评审。已新增 `nudge_events_course_type_idx (course_id, event_type)`（`supabase/migrations/20260805000000_nudge_events_course_skipped_idx.sql`），领头列匹配这次查询的过滤条件。

**5. `NudgeClient.tsx` 从 `people` prop 改成解构 `{people, skippedCount}`，`page.tsx` 相应改用新的响应形状。**

`lib/api.ts::getNudgeList` 返回类型从 `NudgePerson[]` 改成 `{people: NudgePerson[], skippedCount: number}`。

## Risks / Trade-offs

- **[风险] `GET /api/nudge` 响应形状变化是破坏性改动**（裸数组 → 带 `items` 的对象）→ 接受：调用方只有这个应用自己的前端，一次性改掉即可，不存在外部消费者需要过渡期兼容。
- **[风险] CSV 导出的字段转义只处理了逗号/换行，没有处理其他 CSV 边界情况**（比如字段本身含双引号）→ 接受：这批数据是学员姓名/邮箱/微信号，实测不会出现双引号；真出现算已知边界，不为这个低概率场景引入 CSV 生成库。
- **[风险] 模板切换的"是否已编辑"判断用字符串相等比较（当前草稿 === 当前档位默认文案）**，如果讲师把文案编辑成恰好跟另一档默认文案完全一样的文本，再切 tab 会被误判成"没编辑过"从而被替换 → 接受：真实发生概率极低，且被替换后果不severe（重新编辑一次即可），不值得为这个边界引入额外的"是否手动编辑过"标志位。

## Migration Plan

无数据库结构变更——`skipped_count` 是查询时算出的字段，不新增列。部署即生效。

## Open Questions

（无——探索与本文档已定：三档固定模板+自动推荐、CSV 前端生成、进度指示静态三步、跳过人数用一次额外的课程级 COUNT 查询，且已明确记录为对 requirements 原文措辞的一次披露性偏离）
