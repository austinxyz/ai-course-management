### Contract
- **Spec**: 独立页面 SHALL 展示全部学员的互动记录，按时间倒序；SHALL 支持按学员过滤、SHALL 支持按时间范围过滤（今天/最近7天/最近30天/自定义），两者可同时生效；学员筛选器 SHALL 只列出有过互动记录的学员；筛选结果为空时 SHALL 显示说明性文案。侧边栏"互动记录"徽标 SHALL 显示最近 7 天条数。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- Interactions format` → expected: 全部通过，覆盖默认全量展示/学员过滤/时间范围过滤/筛选器只含有记录的学员/空结果文案/侧边栏徽标
- **Code**: 新增 `frontend/lib/format.ts`（`formatAt`/`channelLabel` 从 `nudge/NudgeClient.tsx` 搬过来，design.md 决定 3）；新增 `frontend/app/(app)/interactions/`（`page.tsx`/`InteractionsClient.tsx`/`types.ts`）；`GET /api/interactions` 全量拉取，筛选逻辑全部在客户端（design.md 决定 1）；学员筛选器选项从已加载列表去重推出（design.md 决定 2）
- **Threshold**: 70
