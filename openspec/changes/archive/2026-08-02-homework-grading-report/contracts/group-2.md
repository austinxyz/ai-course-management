### Contract
- **Spec**: 详情面板新增"上传批改报告"按钮，弹系统文件选择框选 `.md`；选中后进入预览屏，展示逐分项评语（默认全勾选的勾选框）、亮点、改进建议；得分不一致的分项行标黄警告；确认后详情面板显示"逐分项评语"块，亮点/改进建议旁标注来源徽章。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient ReportUpload api` → expected: 全部通过，新增用例覆盖上传按钮渲染、预览屏勾选框交互、警告展示、确认后详情面板展示逐分项评语与来源徽章
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-grading-report-mocks.html#detail-panel-upload-button` / `#upload-preview-screen` / `#detail-panel-after-import`——警告用既有 `warning` 语气 token（`homework-rubric` 那次已加过 `--color-warning`），来源徽章复用 `success` 语气；预览屏结构参照 `ImportDialog.tsx` 的预览+确认模式（`onPreview`/`onApply` 两段式，dry_run 走同一套约定）；`accepted_items` 由前端根据勾选框状态算出，随确认请求一并送出
- **Threshold**: 70
