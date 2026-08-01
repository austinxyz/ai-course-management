### Contract
- **Spec**: 前端展示层需要与后端 `auto_created` 字段对齐，把「不在学员表，成绩不会写入」的 danger 呈现改为「自动建档，成绩已写入」的呈现，且因为这类行现在正常写入，不再需要单独的「将跳过」计数。（对应 `specs/homework/spec.md` 的行为变化在 UI 层的呈现）
- **Runtime**: `cd frontend && npm run test -- ImportDialog api actions` → expected: 全部通过，新增/更新的用例覆盖 `auto_created` 面板渲染、计数变化，无 `skipped_no_student`/`skippedNoStudent` 残留引用
- **Code**: 字段改名而非新增字段共存（`design.md` 决策 5）；`willSkip` 相关计算与 danger 计数一并移除；`willWrite`（`created + updated`）本身不需要改，因为后端已经把自动建档的行计入 `created`；仓库现有设计系统只有 `normal`/`danger` 两种语气，不为这一块新增第三种 tone，`auto-created` 面板复用既有的 `normal` 语气（与 `skipped-no-enrollment` 面板一致：都是"写了但需要留意"）；`ImportDialog.tsx`、`types.ts`、`actions.ts`（如引用）、`lib/api.ts` 及各自测试都要同步改名
- **Threshold**: 70
