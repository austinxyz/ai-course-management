## 1. 后端：未知邮箱自动建档 + 建报课 + 返回体改名

### Contract
- **Spec**: 系统 SHALL 自动创建该学员的最小档案与一条报课记录，并 SHALL 正常写入该行的成绩——不再跳过、不再要求人工先建档。自动创建的 `Student` SHALL 使用源文件中的邮箱与姓名；姓名为空时 SHALL 写入占位值「待定」。`region`、`level`、`source` 三个必填字段 SHALL 使用固定占位默认值（`region="美东"`、`level="有基础"`、`source="讲武堂"`）。自动创建的 `Enrollment` SHALL 关联到本次导入的目标课程，`session_id` SHALL 为空，`source` SHALL 为 `"derived"`。同一邮箱在同一课程被多次导入时，SHALL NOT 重复创建 `Student` 或 `Enrollment`。（`specs/homework/spec.md`）该报课记录的 `enrolled_at` SHALL 取该课程所有场次中最早的 `local_date`；该课程尚未创建任何场次时，SHALL 回退为本次导入发生的日期。（`specs/enrollment/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_homework_import.py` → expected: 全部通过，新增用例覆盖自动建档/建报课/enrolled_at 回退/幂等/dry_run，无既有用例回归
- **Code**: 未知邮箱集合就是 `emails 中不在 known 的部分`，复用 `_classify` 已有的批量查询，不逐行查库；`enrolled_at` 的 `min(local_date)` 查询只在存在未知邮箱时才执行一次；dry_run 与非 dry_run 共用同一份"未知邮箱集合"计算，只是后者才真正 `session.add`；占位默认值写成模块级常量 `_AUTO_CREATE_DEFAULTS` / `_UNKNOWN_NAME_PLACEHOLDER`
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/homework-auto-create-student/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `backend/tests/test_homework_import.py`：新增用例，上传含一个全新邮箱（`students` 表原本没有）的 grades.csv，断言导入后该邮箱出现在 `students` 表、有一条 `source="derived"`/`session_id=None` 的 `enrollments` 记录，且 `homework_submissions` 里该邮箱的成绩已写入；同时断言响应体里存在 `auto_created` 字段且包含该邮箱（此时字段尚不存在，测试应失败）
- [x] 1.2 GREEN — `backend/app/routers/homework.py`：在 `_classify` 里对 `emails - known` 集合执行自动建档（`Student(email=..., name=names.get(email) or _UNKNOWN_NAME_PLACEHOLDER, **_AUTO_CREATE_DEFAULTS)`）与自动建报课（`Enrollment(student_email=..., course_id=course.id, session_id=None, source="derived", enrolled_at=...)`），dry_run 时跳过 `session.add` 但仍计入 `auto_created` 列表；`backend/app/schemas.py`：`HomeworkImportResult.skipped_no_student` 改名为 `auto_created`
- [x] 1.3 RED — 新增用例：目标课程已有三场 `course_sessions`（`local_date` 分别为三个不同日期），上传含全新邮箱的文件，断言新建的 `enrollments.enrolled_at` 等于三场中最早的 `local_date`
- [x] 1.4 GREEN — 实现 `enrolled_at` 查询：`select(func.min(CourseSession.local_date)).where(CourseSession.course_id == course.id)`，只在存在未知邮箱时执行一次
- [x] 1.5 RED — 新增用例：目标课程一场 `course_sessions` 都没有，上传含全新邮箱的文件，断言新建的 `enrollments.enrolled_at` 等于导入发生当天（用可注入/可 mock 的日期源，不依赖真实 `date.today()` 的墙钟时间）
- [x] 1.6 GREEN — 补上无场次时回退 `date.today()` 的分支
- [x] 1.7 RED — 新增用例：姓名列为空、邮箱全新的一行，断言新建的 `Student.name == "待定"`
- [x] 1.8 GREEN — 补上姓名为空时使用 `_UNKNOWN_NAME_PLACEHOLDER` 的分支（若 1.2 未覆盖到这条路径）
- [x] 1.9 RED — 新增幂等用例：同一全新邮箱先后导入两次（同一门课），断言第二次导入后 `students`/`enrollments` 表中该邮箱各只有一条记录，且第二次的 `auto_created` 不再包含该邮箱
- [x] 1.10 GREEN — 确认 `_classify` 现有的 `known`/`existing` 批量查询逻辑天然满足幂等（第二次导入时该邮箱已在 `known` 集合里），补齐遗漏分支
- [x] 1.11 RED — 新增用例：`dry_run=true` 且请求中含全新邮箱，断言响应体 `auto_created` 包含该邮箱，但 `students`/`enrollments`/`homework_submissions` 三张表均无新记录
- [x] 1.12 GREEN — 确认 dry_run 分支不执行 `session.add`（复用 `_classify` 现有的 dry_run 短路逻辑）
- [x] 1.13 RED — 回归用例：已在册学员（存在于 `students` 表）的行不应触发自动建档逻辑，`auto_created` 不包含该邮箱
- [x] 1.14 GREEN — 确认自动建档只对 `known` 之外的邮箱触发，不影响既有已在册学员的写入路径
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：ImportDialog 展示自动建档清单

### Contract
- **Spec**: 前端展示层需要与后端 `auto_created` 字段对齐，把「不在学员表，成绩不会写入」的 danger 呈现改为「自动建档，成绩已写入」的呈现，且因为这类行现在正常写入，不再需要单独的「将跳过」计数。（对应 `specs/homework/spec.md` 的行为变化在 UI 层的呈现）
- **Runtime**: `cd frontend && npm run test -- ImportDialog api actions` → expected: 全部通过，新增/更新的用例覆盖 `auto_created` 面板渲染、计数变化，无 `skipped_no_student`/`skippedNoStudent` 残留引用
- **Code**: 字段改名而非新增字段共存（`design.md` 决策 5）；`willSkip` 相关计算与 danger 计数一并移除；`willWrite`（`created + updated`）本身不需要改，因为后端已经把自动建档的行计入 `created`；仓库现有设计系统只有 `normal`/`danger` 两种语气，不为这一块新增第三种 tone，`auto-created` 面板复用既有的 `normal` 语气（与 `skipped-no-enrollment` 面板一致：都是"写了但需要留意"）；`ImportDialog.tsx`、`types.ts`、`actions.ts`（如引用）、`lib/api.ts` 及各自测试都要同步改名
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/homework-auto-create-student/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-01-homework-auto-create-student-mocks.html#import-dialog-before-after；记录改动后一栏的 tokens 与原文文案：`info` 语气面板（`border-info-border`/`bg-info-surface` 对应现有代码里的语气变体）、标题「N 人自动建档，成绩已写入」、hint「档案信息是占位值（美东 / 有基础 / 讲武堂），建议之后去学员页回填真实信息。」
- [x] 2.2 RED — `frontend/app/(app)/homework/ImportDialog.test.tsx`：新增用例，mock 返回体含 `autoCreated: ["new@example.com"]`（不再有 `skippedNoStudent`），断言渲染出 `data-testid="auto-created"` 面板、标题文案含「自动建档」、且断言 wrapper 上不存在旧的 `data-testid="skipped-no-student"`；同时断言顶部「将新建」计数等于 `created + autoCreated.length`，且不再渲染「将跳过」计数
- [x] 2.3 GREEN — `frontend/app/(app)/homework/types.ts`：`skippedNoStudent` 改名为 `autoCreated`；`frontend/lib/api.ts`：响应映射同步改名；`ImportDialog.tsx`：`willSkip`/danger 计数与 `skipped-no-student` 面板整段替换为 `auto-created` 面板（info 语气，文案按 2.1 记录的原文）；`willWrite` 改为 `result.created + result.updated`（`auto_created` 属于已写入的一部分，若原计算已隐含无需改动则确认并在任务中标注）
- [x] 2.4 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`); 打开作业页触发一次含全新邮箱的导入预览；对照 mock 的「改动后」一栏核对面板语气、文案、计数是否一致，修正任何 token/文案偏差
- [x] 2.5 RED — `frontend/app/(app)/homework/actions.test.ts` 与 `frontend/lib/api.test.ts`：更新/新增用例，断言这两处不再引用 `skipped_no_student`/`skippedNoStudent`，类型与转换逻辑改为 `auto_created`/`autoCreated`
- [x] 2.6 GREEN — 同步 `actions.ts` 与 `api.ts` 中与该字段相关的类型定义与透传逻辑
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [x] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [x] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [x] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [x] 3.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
