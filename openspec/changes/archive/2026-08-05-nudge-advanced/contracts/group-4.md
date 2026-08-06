### Contract
- **Spec**: 名单页 SHALL 在同一份列表里展示已跳过的人（灰显 + "已跳过"标签），SHALL 提供"取消跳过"入口，取消后按真实作业状态重新参与"未交"判定。名单页头部 SHALL NOT 展示进度指示。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` 与 `cd frontend && npm run test -- NudgeClient` → expected: 全部通过，覆盖跳过后仍在 items 里可见/取消跳过后 skipped 变 false/进度指示区域不再渲染
- **Code**: `NudgePersonRead` 加 `skipped: bool`（从 history 里最新一条 skipped/unskipped 事件算出）；`list_nudge` 去掉 `_SKIPPED_EXISTS`，`skipped_count` 从 `items` 直接算不再查库；`count_nudge` 的 `_SKIPPED_EXISTS` 不变（侧边栏徽标仍不计入跳过的人）；`NudgeEventCreate.event_type` 扩到 `nudged | skipped | unskipped`；前端移除 `NudgeSteps`，已跳过行灰显+标签，详情面板按 `skipped` 切换"跳过"/"取消跳过"按钮（design.md 决定 3/4/5/6）
- **Threshold**: 80
