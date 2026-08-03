### Contract
- **Spec**: 学员详情页「报课记录」每一行 SHALL 显示该门课的作业情况：有提交记录显示「已交 · N 分」，没有显示「未交」；该行 SHALL 可点击，跳转到 `/homework?course=<courseId>&student=<email>`。（`specs/enrollment/spec.md` 的 `homework_total` 字段是这块 UI 的数据来源；UI 行为本身记在 `docs/superpowers/specs/2026-08-03-student-homework-summary-requirements.md` 的 "UI Description" 一节）
- **Runtime**: `cd frontend && npm run test -- EnrollmentRows` → expected: 全部通过，新增用例覆盖已交/未交两种展示与跳转链接的 href，无既有用例回归
- **Code**: `frontend/app/(app)/students/types.ts` 的 `Enrollment` 加 `homeworkTotal: number | null`；`frontend/lib/api.ts` 的报课映射函数加一行蛇形→驼峰；`EnrollmentRow`（`EnrollmentRows.tsx`）新增一行，复用现有 `font-mono text-[11px] text-muted-foreground` 规格（跟场次/报名日期同一套），「已交」态用 `text-primary` 链接色，「未交」态 `text-muted-foreground`，两者都是 `<a href>` 不是按钮；不新增视觉 token
- **Threshold**: 80
