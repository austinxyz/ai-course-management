## 1. 后端：评分表 + 满分读写端点 + 单次往返附着到作业列表

### Contract
- **Spec**: 系统 SHALL 在课程页提供一处入口，讲师可以给某门课的各个分项录入满分（正整数）。分项名字 SHALL 由系统自动列出——取该课程 `homework_submissions.scores` 中出现过的全部去重分项名，SHALL NOT 要求讲师手工输入分项名。满分 SHALL 允许为空（未配置），已配置的满分 SHALL 拒绝非正整数（0 或负数）。该分项在这门课配了满分时，系统 SHALL 在原始分旁显示满分（「X / 满分」），并 SHALL 绘制一条按比例填充的条形图，条形图与分数文字 SHALL 按同一套三档阈值染色（≥90% 绿、70%–90% 黄、<70% 红）；没有配满分时只显示原始分。总分 SHALL 在这门课当前用到的全部分项都配了满分时显示按比例进度条与同一套三档颜色，否则只显示数字。名单表格每一行 SHALL 显示一串迷你竖条，配了满分的分项才有对应竖条，颜色同三档阈值。（`specs/homework/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_homework_rubric.py tests/test_homework_read.py` → expected: 全部通过，新增用例覆盖满分录入/校验/自动列出分项名、`GET /api/homework` 附带满分与颜色档位、单次往返未被打破
- **Code**: 新表 `homework_rubric_items`（`course_id, item` 主键，`max_score` 带 `CHECK (max_score > 0)`）；`GET /api/homework` 用**标量子查询**（`func.jsonb_object_agg`）把满分表聚合进主查询，不新增 `session.exec` 调用；"总分要不要显示进度条"按**这条提交自己的分项集合**判定（不做跨课程完整性校验）；`PUT /api/homework/rubric` 整表覆盖式写入，`max_score` 为 `null` 的项删除对应行
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/homework-rubric/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 写 migration `supabase/migrations/<timestamp>_create_homework_rubric_items.sql`：`CREATE TABLE homework_rubric_items (course_id uuid NOT NULL REFERENCES courses(id), item text NOT NULL, max_score integer NOT NULL CHECK (max_score > 0), PRIMARY KEY (course_id, item));`，本地跑 `supabase db reset` 验证无报错
- [x] 1.2 `backend/app/models.py`：新增 `HomeworkRubricItem` 模型
- [x] 1.3 RED — `backend/tests/test_homework_rubric.py`（新文件）：新增用例，`GET /api/homework/rubric?course=<id>` 对一门已有提交（含分项 A1、D2）但还没配任何满分的课程，断言返回体列出这两个分项名、`max_score` 均为 `null`；此时端点不存在，测试应 404 失败
- [x] 1.4 GREEN — `backend/app/routers/homework.py` 新增 `GET /api/homework/rubric?course=`：查该课程 `homework_submissions.scores` 里出现过的去重分项名（Python 端从已取的 `scores` 数组去重，不新增 SQL 查询——该端点本身独立于「单次往返」约束，那条约束只管 `GET /api/homework`），LEFT JOIN `homework_rubric_items` 取已配置的满分；`backend/app/schemas.py` 加对应 `RubricItemRead`
- [x] 1.5 RED — 新增用例：`PUT /api/homework/rubric` 提交 `{course_id, items: [{item: "A1", max_score: 50}, {item: "D2", max_score: null}]}`，断言 A1 的满分记录为 50，D2 没有对应行（或原有行被删除）
- [x] 1.6 GREEN — 实现 `PUT /api/homework/rubric`：`max_score` 有值的 upsert，`null` 的删除已存在的行
- [x] 1.7 RED — 新增用例：`PUT /api/homework/rubric` 提交 `max_score: 0` 或负数，断言请求被拒绝（422），说明满分必须是正整数
- [x] 1.8 GREEN — 加校验（依赖数据库 `CHECK` 约束翻译成 422，或在写入前应用层校验，两者选一，取决于 `IntegrityError` 能否翻出干净的错误信息——实现时验证一次再定）
- [x] 1.9 RED — `backend/tests/test_homework_read.py`：新增用例，某门课某学员两个分项都配了满分，断言 `GET /api/homework?course=` 该学员的每个 `scores` 元素带 `max` 字段与正确的百分比派生值（或前端需要的等价字段，字段名在 1.10 GREEN 时按 schema 实际定），且总分带 `total_max`（等于两项满分之和）
- [x] 1.10 GREEN — `list_homework` 加标量子查询聚合满分 map，`HomeworkPersonRead`/`ScoreItem` 附加 `max: int | None`；每条提交若其全部 `scores` 项都有 `max`，则 `HomeworkPersonRead.total_max` 为满分之和，否则为 `None`
- [x] 1.11 RED — 新增用例：某门课一个分项没配满分，断言该学员响应体里 `total_max` 为 `None`，已配置的那个分项的 `scores[i].max` 仍然正确返回（不因为总分不完整就一起不返回）
- [x] 1.12 GREEN — 补齐遗漏分支（预期已被 1.10 覆盖，若测试失败则修正 `total_max` 判定逻辑）
- [x] 1.13 RED — 用 SQLAlchemy 的 `before_cursor_execute` 事件计数（参照既有「往返次数受约束」测试的写法，若无先例则新写一个小型断言）：对含满分数据的课程调用 `GET /api/homework`，断言发出的 SQL 语句数仍是 1
- [x] 1.14 GREEN — 确认标量子查询确实内嵌在主 `select()` 里，没有额外 `session.exec` 调用
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：课程页满分维护表单

### Contract
- **Spec**: 系统 SHALL 在课程页提供一处入口，讲师可以给某门课的各个分项录入满分（正整数）。分项名字 SHALL 由系统自动列出，SHALL NOT 要求讲师手工输入分项名。满分 SHALL 允许为空，已配置的 SHALL 拒绝非正整数。（`specs/homework/spec.md`「讲师可以在课程页维护各分项满分」）
- **Runtime**: `cd frontend && npm run test -- CourseRubric` → expected: 全部通过，新增用例覆盖分项自动列出、保存、留空不阻塞、拒绝非正整数的错误提示
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html#course-page-rubric-editor`——分项名列表 + 每项一个数字输入框，未配置的用 placeholder「未配置」；保存走整表提交（对应后端 `PUT /api/homework/rubric`），参照现有课程页表单的 Server Action 错误呈现模式
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/homework-rubric/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html#course-page-rubric-editor；记录表单布局与 tokens（表格两列：分项名 / 满分输入框，未配置项 placeholder「未配置」）
- [x] 2.2 RED — 课程页组件测试（新文件或加进既有课程页测试）：mock `GET /api/homework/rubric` 返回两个分项（一个已配满分、一个未配置），断言表单渲染出对应输入框，已配置的显示当前值、未配置的显示 placeholder
- [x] 2.3 GREEN — 新建 `frontend/app/(app)/courses/RubricEditor.tsx`（或加进既有课程详情组件），`frontend/lib/api.ts` 加 `getHomeworkRubric`/`saveHomeworkRubric` 调用
- [x] 2.4 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开课程页核对表单与 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [x] 2.5 RED — 新增用例：提交一个 0 或负数的满分，断言页面就地显示错误、不发生跳转、其余字段保留用户输入
- [x] 2.6 GREEN — 处理后端 422 的错误呈现
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：作业详情面板 X/满分 + 条形图染色，总分进度条，名单迷你竖条

### Contract
- **Spec**: 该分项配了满分时 SHALL 显示「X / 满分」+ 按比例条形图，条形图与分数文字 SHALL 按三档阈值染色（≥90% 绿、70%–90% 黄、<70% 红）；没配满分只显示原始分。总分 SHALL 在全部分项配齐时显示按比例进度条 + 三档颜色，否则只显示数字。名单表格每行 SHALL 显示一串迷你竖条，配了满分的分项才有对应竖条，颜色同三档阈值。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient` → expected: 全部通过，新增用例覆盖分项染色三档、总分进度条仅在配齐时出现、名单迷你竖条渲染
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html#detail-panel-rubric-full`（详情面板三档示例）、`#detail-panel-rubric-partial`（部分配置回退）、`#roster-table-sparkline`（名单迷你竖条）；三档阈值与颜色 token 在这三处必须一致（沿用 `--color-success`，新增 `--color-warning`/`--color-warning-fg` 与既有 `--color-danger`）；`types.ts` 加 `max`/`totalMax` 字段
- **Threshold**: 70

- [x] 3.0 CONTRACT — write openspec/changes/homework-rubric/contracts/group-3.md with the ### Contract block above
- [x] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html#detail-panel-rubric-full 与 #roster-table-sparkline；记录三档颜色 token、条形图/竖条的具体样式数值
- [x] 3.2 RED — `frontend/app/(app)/homework/HomeworkClient.test.tsx`：新增用例，分项 `max` 存在时渲染「X / 满分」+ 条形图，按分数比例分别断言绿/黄/红三档 class；`max` 不存在时只渲染原始分、不渲染条形图
- [x] 3.3 GREEN — 在 `frontend/app/globals.css` 加 `--color-warning`/`--color-warning-fg` token（参照既有 `--color-success`/`--color-danger` 的定义方式）；`HomeworkClient.tsx` 详情面板分项渲染逻辑加满分/条形图/三档染色
- [x] 3.4 VISUAL DIFF — bring up dev stack；核对详情面板三档颜色与 mock 一致（同上，Basic Auth 挡住时用组件级渲染降级）
- [x] 3.5 RED — 新增用例：`totalMax` 存在时总分渲染进度条 + 对应颜色 class；`totalMax` 为 `null`（有分项未配满分）时总分只渲染数字、不渲染进度条
- [x] 3.6 GREEN — 实现总分进度条渲染逻辑
- [x] 3.7 RED — 新增用例：名单表格某行有两个已配满分的分项，断言渲染出两根迷你竖条且颜色/高度符合比例；某分项未配满分时，该分项不产生竖条
- [x] 3.8 GREEN — 名单表格加迷你竖条渲染
- [x] 3.9 VISUAL DIFF — 核对名单表格与 mock 的 `#roster-table-sparkline` 一致
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证与收尾

- [x] 4.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [x] 4.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [x] 4.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [x] 4.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
