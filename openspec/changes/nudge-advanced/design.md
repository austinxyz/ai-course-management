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

**3.（撤销，见下）进度指示上线后实测不达标——静态高亮"起草文案"给人"卡住了"的观感，而不是进度。group-4 里直接移除这块 UI，不再保留。**

**4. `GET /api/nudge?course=` 的响应形状从裸数组改成 `{items, skipped_count}`；`items` 现在同时包含未交名单与已跳过的人（`skipped: bool` 逐行标出），`skipped_count` 由 `items` 直接算出，不再需要额外查询。**

group-4 上线前的观察：跳过的人被 `_SKIPPED_EXISTS` 整个排除在结果集之外——讲师点了"跳过"之后就再也看不到这个人，无从确认、也无从反悔。这直接暴露了 group-1 决定 4 里"零额外往返 vs 额外一次 COUNT"这个二选一本身问的不是对问题：真正该问的是"跳过的人到底要不要出现在结果行里"——答案是要，一旦出现在行里，`skipped_count` 自然可以从 `items` 里数出来，不需要任何查询，`nudge_events_course_type_idx` 索引与那次额外 COUNT 查询一起作废（迁移文件保留，不影响正确性，只是不再被这条路径使用）。

```python
class NudgePersonRead(BaseModel):
    ...
    skipped: bool  # 新增


class NudgeListRead(BaseModel):
    items: list[NudgePersonRead]
    skipped_count: int  # = sum(p.skipped for p in items)，不查库
```

`skipped` 从 `history` 算：history 已按时间倒序返回，取其中类型属于 `{skipped, unskipped}` 的最新一条，是 `skipped` 则为 True，是 `unskipped` 或没有则为 False。`list_nudge` 的 `WHERE` 去掉 `_SKIPPED_EXISTS`——一个人只要处于"未交"状态就出现在 `items` 里，不再区分是否被跳过；`count_nudge`（侧边栏徽标）保留"跳过的人不计入需要处理总数"这条语义，但判断本身要跟着改——`_SKIPPED_EXISTS` 判的是"曾经出现过 skipped 事件"，不是"当前是否跳过"，取消跳过之后这个人会被它永久漏计（group-4 code review 发现）。改用 `_NOT_CURRENTLY_SKIPPED`：取最新一条 skipped/unskipped 事件判断，跟 `list_nudge` 的 `_is_currently_skipped` 是同一套逻辑的 SQL 版本。

**5. 取消跳过是新事件类型 `unskipped`，不是删除已有的 `skipped` 事件行——`nudge_events` 是仅追加的操作日志，删除会破坏"催促历史"的可审计性。**

`NudgeEventCreate.event_type` 从 `nudged | skipped` 扩到 `nudged | skipped | unskipped`。`unskipped` 跟 `skipped` 一样没有 `channel`。

**6. `NudgeClient.tsx` 从 `people` prop 改成解构 `{people, skippedCount}`，`page.tsx` 相应改用新的响应形状。已跳过的行原地灰显 + "已跳过"标签，不单独分区；详情面板按 `person.skipped` 切换"跳过"/"取消跳过"按钮。**

`lib/api.ts::getNudgeList` 返回类型从 `NudgePerson[]` 改成 `{people: NudgePerson[], skippedCount: number}`；`people` 现在包含跳过的行，`skippedCount` 供头部摘要行使用（不需要前端自己再算一遍）。移除 `NudgeSteps` 组件与其在头部的渲染位置——决定 3。

## Risks / Trade-offs

- **[风险] `GET /api/nudge` 响应形状变化是破坏性改动**（裸数组 → 带 `items` 的对象）→ 接受：调用方只有这个应用自己的前端，一次性改掉即可，不存在外部消费者需要过渡期兼容。
- **[风险] CSV 导出的字段转义只处理了逗号/换行，没有处理其他 CSV 边界情况**（比如字段本身含双引号）→ 接受：这批数据是学员姓名/邮箱/微信号，实测不会出现双引号；真出现算已知边界，不为这个低概率场景引入 CSV 生成库。
- **[风险] 模板切换的"是否已编辑"判断用字符串相等比较（当前草稿 === 当前档位默认文案）**，如果讲师把文案编辑成恰好跟另一档默认文案完全一样的文本，再切 tab 会被误判成"没编辑过"从而被替换 → 接受：真实发生概率极低，且被替换后果不severe（重新编辑一次即可），不值得为这个边界引入额外的"是否手动编辑过"标志位。

## Migration Plan

无数据库结构变更——`skipped` 与 `skipped_count` 都是查询/内存算出的字段，不新增列。部署即生效。`nudge_events_course_type_idx` 索引（group-1 加的）不再被这条路径使用，但留着无害，不回滚。

## Open Questions

（无——group-4 在实测反馈后修订：进度指示移除；已跳过的人改为在 `items` 里可见（`skipped` 标记）+ 可撤销，`skipped_count` 从 `items` 算出，group-1 的额外 COUNT 查询作废）
