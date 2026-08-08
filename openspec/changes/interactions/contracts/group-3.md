### Contract
- **Spec**: 学员详情面板 SHALL 展示该学员最近互动，最多 5 条，按时间倒序；没有记录时 SHALL 显示说明性文案。`nudge` 页"查看互动记录"入口 SHALL 跳转到互动记录页且预筛选为当前学员。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- DetailPanel NudgeClient` → expected: 全部通过，覆盖最近 5 条展示/无记录文案/跳转链接带预筛选参数
- **Code**: `students/page.tsx` 新增 `getInteractions()` 一次性拉取，`StudentsClient.tsx` 客户端过滤后 `.slice(0, 5)` 传给 `DetailPanel`（design.md 决定 4，跟 `enrollments` 现有模式一致）；`interactions/page.tsx` 读 `searchParams.student` 作为初始筛选值（design.md 决定 5）；`nudge/NudgeClient.tsx` 的"查看互动记录"按钮改成 `<Link href={`/interactions?student=${email}`}>`
- **Threshold**: 70
