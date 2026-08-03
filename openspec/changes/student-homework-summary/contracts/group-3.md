### Contract
- **Spec**: `/homework` 页 SHALL 接受 `student` query 参数（学员邮箱）。存在该参数且该邮箱在当前课程名单里时，页面加载时 SHALL 自动展开该学员的详情面板。参数缺失或指向的邮箱不在当前课程名单里时，SHALL 保持原有行为（不自动选中任何人）。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient page` → expected: 全部通过，新增用例覆盖带参数且命中/带参数但不命中/不带参数三种情形，无既有用例回归
- **Code**: `frontend/app/(app)/homework/page.tsx` 的 `searchParams` 类型加 `student?: string`，读出后作为新 prop 传给 `HomeworkClient`；`HomeworkClient` 的 `selected` 状态初始值从该 prop 取（默认 `null`），不做服务端或客户端校验——`rows.find(...)` 找不到时天然不展开，不需要额外的"不存在"分支
- **Threshold**: 80
