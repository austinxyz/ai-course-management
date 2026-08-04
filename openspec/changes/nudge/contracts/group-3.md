### Contract
- **Spec**: `/nudge` 页 SHALL 按课程展示未交名单（姓名/微信/逾期天数/已催次数/上次催促时间），选中一人 SHALL 在详情面板展示自动生成的可编辑草稿（套姓名/课程/逾期天数）与催促历史（按时间倒序，无记录时显示"还没催过这个人"）。（`specs/nudge/spec.md`；UI 结构见 `docs/superpowers/specs/mocks/2026-08-03-nudge-mocks.html`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient nudge` → expected: 全部通过，覆盖名单渲染/课程切换/选中展开详情/草稿文本套值/催促历史展示与空态
- **Code**: 新建 `frontend/app/(app)/nudge/page.tsx`（替换现有占位页）与 `NudgeClient.tsx`；草稿在前端纯函数 `draftFor(person)` 现算，不新增后端模板端点（design.md 决定 5）；从 `frontend/app/(app)/placeholder-routes.test.tsx` 移除"催作业"这一条（不再是占位页，仿此前作业/报课页转正时的先例），保留"互动记录"那条
- **Threshold**: 70
