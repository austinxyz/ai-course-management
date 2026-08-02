## 1. 后端：新增字段 + 切换端点 + 待回复判据

### Contract
- **Spec**: 系统 SHALL 允许讲师在提交详情面板将某条提交标记为「已回复」或改回「未回复」，标记 SHALL 可以来回切换。标记的时间戳 SHALL 由服务端记录，SHALL NOT 由客户端提供。该标记 SHALL 独立于源文件的 `reply_status` 列存储，重新导入这门课的成绩 SHALL NOT 清除或改变已有的标记。变更上线前已存在的提交记录，标记 SHALL 为默认值（未标记为已回复）。「待回复」SHALL 定义为：已交，且未被讲师标记为已回复（`replied = false`）。回复状态（源文件的 `reply_status` 列）SHALL NOT 参与「待回复」筛选的判据。（`specs/homework/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_homework_reply_status.py tests/test_homework_read.py` → expected: 全部通过，新增用例覆盖标记/取消标记/时间戳服务端盖/重新导入不清空/默认值/待回复判据切换，无既有用例回归
- **Code**: migration 用 `ALTER TABLE homework_submissions ADD COLUMN replied boolean NOT NULL DEFAULT false, ADD COLUMN replied_at timestamptz`；两个动作式端点 `POST /api/homework/submissions/{id}/reply` 与 `.../unreply`（参照 `Student.archive`/`restore`：无请求体，时间戳 `datetime.now(UTC)` 服务端盖，`reply` 同时设置两个字段、`unreply` 同时清空两个字段，不留中间态）；`_classify` 的整行覆盖不需要显式排除这两列——`row` 来自 `homework_parsing.parse()` 的输出，本来就不含这两个键，用 RED 测试直接断言这一点而不是只读代码确认
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/homework-reply-status/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 写 migration `supabase/migrations/<timestamp>_homework_submissions_replied.sql`：`ALTER TABLE homework_submissions ADD COLUMN replied boolean NOT NULL DEFAULT false, ADD COLUMN replied_at timestamptz;`，本地跑 `supabase db reset` 验证无报错
- [ ] 1.2 `backend/app/models.py`：`HomeworkSubmission` 加 `replied: bool = Field(default=False)` 与 `replied_at: datetime | None = Field(default=None)`
- [ ] 1.3 RED — `backend/tests/test_homework_reply_status.py`（新文件）：新增用例，对一条已存在的提交 POST `/api/homework/submissions/{id}/reply`，断言响应 `replied=true`、`replied_at` 非空；此时端点不存在，测试应 404 失败
- [ ] 1.4 GREEN — `backend/app/routers/homework.py` 新增 `POST /api/homework/submissions/{id}/reply` 与 `.../unreply`，`backend/app/schemas.py` 加对应 `HomeworkSubmissionRead`（或复用现有响应模型）里的 `replied`/`replied_at` 字段
- [ ] 1.5 RED — 新增用例：对同一条提交先 `reply` 再 `unreply`，断言最终 `replied=false`、`replied_at=null`
- [ ] 1.6 GREEN — 实现 `unreply` 清空两个字段
- [ ] 1.7 RED — 新增用例：`reply` 请求体里携带一个自定义时间戳，断言实际记录的 `replied_at` 是服务端当前时间（在测试执行窗口内），不是请求体里的值
- [ ] 1.8 GREEN — 确认端点不读请求体（或读了也不使用），时间戳固定用 `datetime.now(UTC)`
- [ ] 1.9 RED — 新增用例：标记一条提交为已回复后，重新导入该课程的 grades.csv（同一学员、成绩数据不同但邮箱相同），断言导入后该提交的 `replied` 仍为 `true`
- [ ] 1.10 GREEN — 确认 `_classify` 的覆盖字典不含 `replied`/`replied_at`（预期已经天然满足，补齐遗漏分支）
- [ ] 1.11 RED — `backend/tests/test_homework_read.py`：新增/修改用例，某学员已交、源文件 `reply_status="已回复"`、但未调用 `reply` 端点，断言该学员仍计入「待回复」筛选与计数；另一学员已交、`reply_status="待回复"`、调用过 `reply` 端点，断言不计入「待回复」
- [ ] 1.12 GREEN — `GET /api/homework` 的「待回复」判据从 `reply_status != "已回复"` 改为 `replied == false`
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：详情面板标记按钮 + 筛选联动

### Contract
- **Spec**: 「待回复」筛选与计数改用后端返回的 `replied` 字段判定，不再看 `replyStatus`。详情面板在「回复状态」字段之后新增独立的「讲师标记」控件：未标记时显示「标记已回复」按钮；标记后显示徽章 + 时间戳 + 「标记未回复」按钮，可来回切换。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient api` → expected: 全部通过，新增用例覆盖标记/取消标记按钮渲染、筛选联动、类型/API 层字段同步
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-reply-status-mocks.html#detail-panel-reply-toggle`——两个字段视觉上分开（回复状态原文 + 独立的讲师标记行），标记态用 `--accent`/`--accent-surface` 系的柔和绿色徽章，不复用 danger 语气；`types.ts`/`lib/api.ts` 加 `replied`/`repliedAt` 字段与两个调用（`markReplied`/`markUnreplied`）；按钮点击后走 Server Action，参照现有 `ExcludeButton`/`archive` 按钮的禁用态与错误呈现模式
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/homework-reply-status/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-02-homework-reply-status-mocks.html#detail-panel-reply-toggle；记录两态的文案（「标记已回复」/「标记未回复」/「尚未标记」/「✓ 已回复」+ 时间戳）与徽章配色 tokens
- [ ] 2.2 RED — `frontend/app/(app)/homework/HomeworkClient.test.tsx`：新增用例，某学员 `replied=false` 时详情面板渲染「标记已回复」按钮；`replied=true` 时渲染已回复徽章 + 时间戳 + 「标记未回复」按钮；筛选「待回复」时断言 `replied=true` 的人不出现、`replied=false` 的人出现（即使 `replyStatus` 分别相反）
- [ ] 2.3 GREEN — `frontend/app/(app)/homework/types.ts` 加 `replied: boolean`、`repliedAt: string | null`；`frontend/lib/api.ts` 加 `markHomeworkReplied`/`markHomeworkUnreplied` 两个调用与响应类型同步；`HomeworkClient.tsx` 的 `awaitingReply` 改用 `person.replied === false`；在「回复状态」`Field` 之后加标记控件（按 2.1 记录的文案与配色）
- [ ] 2.4 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开作业页选中一名已交学员，核对标记控件语气/文案/位置与 mock 一致，修正任何 token/文案偏差（若站点 Basic Auth 挡住自动化浏览器，按上一次的降级方案改用 vitest 组件级渲染核对并如实记录）
- [ ] 2.5 RED — `frontend/app/(app)/homework/actions.test.ts`：新增用例，标记/取消标记走 Server Action，鉴权失败时抛出（与现有 `onExclude` 同一套错误处理约定）
- [ ] 2.6 GREEN — `frontend/app/(app)/homework/actions.ts` 加对应 Server Action，转发到 `lib/api.ts` 的新调用
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [ ] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [ ] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [ ] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [ ] 3.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
