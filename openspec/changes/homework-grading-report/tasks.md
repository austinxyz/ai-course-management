## 1. 后端：报告解析 + 存储 + 覆盖保护

### Contract
- **Spec**: 系统 SHALL 允许讲师在提交详情面板为当前选中的提交上传一份批改报告文件（`.md`）。上传按内容判定，不按扩展名，且 SHALL 有体积上限。上传后 SHALL 先展示预览屏，SHALL NOT 直接写入；预览屏展示解析出的逐分项评语（每条带勾选框，默认全部勾选）、整体的亮点、改进建议。分项得分或总分与现有 `scores`/`total` 不一致时该分项行 SHALL 高亮警告，SHALL NOT 阻止确认导入。确认导入时 SHALL 只写入勾选了的分项评语；亮点、改进建议 SHALL 覆盖 `highlight`/`improve`。系统 SHALL NOT 解析「讲师回复草稿」与「作业原文」。分项对齐 SHALL 只取编号前缀匹配。某条提交的 `highlight`/`improve` 一旦被批改报告导入覆盖过，之后重新导入这门课的 `grades.csv` SHALL NOT 再覆盖这两个字段；其余字段正常按整行覆盖更新；未上传过报告的提交不受影响。（`specs/homework/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_homework_report_parsing.py tests/test_homework_report.py tests/test_homework_import.py` → expected: 全部通过，新增用例覆盖解析、预览不写入、勾选过滤写入、得分不一致警告不阻止、锁定字段不被重新导入覆盖、未锁定的提交重新导入照常更新，无既有用例回归
- **Code**: 新增纯函数解析模块 `backend/app/homework_report_parsing.py`（参照 `homework_parsing.py` 模式，不碰数据库/文件系统）；表格行按 `^([A-Z]\d+)` 正则取编号前缀，忽略后面中文标题；`### 亮点`/`### 改进建议` 到下一个 `###` 之间的内容分别提取；一行都解析不出时 422 拒绝；`HomeworkSubmission` 新增 `dimension_comments`（jsonb 数组，形状同 `scores`）与 `highlight_locked`（bool）两列；端点复用 `dry_run` 约定（`POST /api/homework/submissions/{id}/report?dry_run=`），确认时前端重新提交同一份 `content_base64` + `accepted_items`，不依赖服务端临时状态；`_classify` 更新既有记录时，`found.highlight_locked` 为真则从写入字段里剔除 `highlight`/`improve`，只在更新路径加，不影响新建
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/homework-grading-report/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 写 migration `supabase/migrations/<timestamp>_homework_submissions_report.sql`：`ALTER TABLE homework_submissions ADD COLUMN dimension_comments jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN highlight_locked boolean NOT NULL DEFAULT false;`，本地跑 `supabase db reset` 验证无报错
- [x] 1.2 `backend/app/models.py`：`HomeworkSubmission` 加 `dimension_comments: list[dict] = Field(default_factory=list, sa_column=Column(JSONB, nullable=False))` 与 `highlight_locked: bool = Field(default=False)`
- [x] 1.3 RED — `backend/tests/test_homework_report_parsing.py`（新文件）：用 Helen He 那份 report.md 的真实文本（脱敏成虚构姓名）构造用例，断言 `parse_report()` 解析出的分项列表含 `{code: "A1", score: 13, max: 15, comment: "..."}`，且亮点、改进建议文本正确提取，讲师回复草稿与作业原文不在解析结果里；此时函数不存在，测试应失败
- [x] 1.4 GREEN — 实现 `homework_report_parsing.py` 的 `parse_report(text: str) -> ReportParseResult`（dataclass：`items: list[dict]`、`highlight: str`、`improve: str`）
- [x] 1.5 RED — 新增用例：表格单元格得分/满分不是数字时，`parse_report` 抛出可读异常（说得出是哪一行哪一列，参照 `MalformedCell` 的错误设计）；整份文本里一行表格都解析不出时抛出"这看起来不是批改报告"异常
- [x] 1.6 GREEN — 实现两类异常与对应校验
- [x] 1.7 RED — `backend/tests/test_homework_report.py`（新文件）：新增用例，对一条已交提交 `POST /api/homework/submissions/{id}/report?dry_run=true`，body 带解析用的 report 文本 base64，断言返回体包含逐分项评语、亮点、改进建议，且 `db_session` 里该提交的 `highlight`/`dimension_comments` 均未被写入；此时端点不存在，测试应 404 失败
- [x] 1.8 GREEN — 新增端点，`dry_run=true` 分支只解析返回，不写入；`backend/app/schemas.py` 加对应请求/响应 schema
- [x] 1.9 RED — 新增用例：`dry_run=false` 且 `accepted_items` 只含部分分项编号，断言只有勾选的分项写入 `dimension_comments`，未勾选的不在其中；`highlight`/`improve` 被报告内容覆盖，且 `highlight_locked` 变为 `true`
- [x] 1.10 GREEN — 实现 `dry_run=false` 分支：按 `accepted_items` 过滤、写入、设置 `highlight_locked`
- [x] 1.11 RED — 新增用例：某分项报告里的得分与该提交现有 `scores` 中对应项不一致时，`dry_run=true` 的响应体该分项带 `mismatch: true` 标记；`dry_run=false` 确认导入时这条不一致**不阻止**写入成功
- [x] 1.12 GREEN — 实现得分/总分比对与 `mismatch` 标记
- [x] 1.13 RED — `backend/tests/test_homework_import.py`：新增用例，先给某条提交上传报告（走 1.7-1.10 的端点，`highlight_locked` 变 `true`），再重新导入这门课的 grades.csv（该学员那行的亮点/改进建议列与报告不同），断言该提交的 `highlight`/`improve` 仍是报告版本，`total`/`scores` 等其余字段正常更新；另一条从未上传过报告的提交，重新导入照常更新 `highlight`/`improve`
- [x] 1.14 GREEN — `_classify` 更新既有记录分支加 `highlight_locked` 判断，剔除对应字段
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：上传按钮 + 预览对话框 + 逐分项评语展示

### Contract
- **Spec**: 详情面板新增"上传批改报告"按钮，弹系统文件选择框选 `.md`；选中后进入预览屏，展示逐分项评语（默认全勾选的勾选框）、亮点、改进建议；得分不一致的分项行标黄警告；确认后详情面板显示"逐分项评语"块，亮点/改进建议旁标注来源徽章。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient ReportUpload api` → expected: 全部通过，新增用例覆盖上传按钮渲染、预览屏勾选框交互、警告展示、确认后详情面板展示逐分项评语与来源徽章
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-grading-report-mocks.html#detail-panel-upload-button` / `#upload-preview-screen` / `#detail-panel-after-import`——警告用既有 `warning` 语气 token（`homework-rubric` 那次已加过 `--color-warning`），来源徽章复用 `success` 语气；预览屏结构参照 `ImportDialog.tsx` 的预览+确认模式（`onPreview`/`onApply` 两段式，dry_run 走同一套约定）；`accepted_items` 由前端根据勾选框状态算出，随确认请求一并送出
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/homework-grading-report/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-02-homework-grading-report-mocks.html#detail-panel-upload-button 与 #upload-preview-screen 与 #detail-panel-after-import；记录按钮文案「上传批改报告」、预览屏警告文案样式、勾选框默认态、来源徽章文案「来自批改报告」
- [x] 2.2 RED — `frontend/app/(app)/homework/HomeworkClient.test.tsx`：新增用例，详情面板渲染「上传批改报告」按钮；选择文件后触发预览请求，渲染出逐分项评语列表（含勾选框，默认全部勾选）与警告标记
- [x] 2.3 GREEN — `frontend/app/(app)/homework/types.ts` 加相关类型；`frontend/lib/api.ts` 加 `previewHomeworkReport`/`saveHomeworkReport` 两个调用；新建预览对话框组件（可以是 `HomeworkClient.tsx` 内的子组件，参照 `ImportDialog.tsx` 的结构但不用整体复用——那个是课程级导入，这个是单条提交级）
- [x] 2.4 RED — 新增用例：取消勾选某一项分项评语后点击确认，断言发出的确认请求 `accepted_items` 不包含那一项
- [x] 2.5 GREEN — 实现勾选框状态到 `accepted_items` 的计算与提交
- [x] 2.6 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开作业页选中一名已交学员，核对上传按钮、预览屏、导入后展示与 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [x] 2.7 RED — 新增用例：确认导入成功后，详情面板显示「逐分项评语」块与亮点/改进建议旁的「来自批改报告」徽章
- [x] 2.8 GREEN — 实现导入后展示逻辑
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [x] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [x] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [x] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [x] 3.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
