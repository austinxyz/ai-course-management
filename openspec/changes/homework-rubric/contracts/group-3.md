### Contract
- **Spec**: 该分项配了满分时 SHALL 显示「X / 满分」+ 按比例条形图，条形图与分数文字 SHALL 按三档阈值染色（≥90% 绿、70%–90% 黄、<70% 红）；没配满分只显示原始分。总分 SHALL 在全部分项配齐时显示按比例进度条 + 三档颜色，否则只显示数字。名单表格每行 SHALL 显示一串迷你竖条，配了满分的分项才有对应竖条，颜色同三档阈值。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient` → expected: 全部通过，新增用例覆盖分项染色三档、总分进度条仅在配齐时出现、名单迷你竖条渲染
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html#detail-panel-rubric-full`（详情面板三档示例）、`#detail-panel-rubric-partial`（部分配置回退）、`#roster-table-sparkline`（名单迷你竖条）；三档阈值与颜色 token 在这三处必须一致（沿用 `--color-success`，新增 `--color-warning`/`--color-warning-fg` 与既有 `--color-danger`）；`types.ts` 已加 `max`/`totalMax` 字段（group 1/2 已完成后端与类型透传，本组只做渲染）
- **Threshold**: 70
