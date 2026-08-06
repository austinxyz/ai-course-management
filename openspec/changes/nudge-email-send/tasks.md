## 1. 后端：SMTP 客户端 + 发送邮件端点

### Contract
- **Spec**: 详情面板确认后 SHALL 通过 SMTP 把草稿发到该学员邮箱，主题固定 `《{课程名}》作业提醒`。发送成功 SHALL 自动记一条 `channel=email` 的 `nudged` 事件，SHALL NOT 经过 `_channel_for()` 自动判定。发送失败 SHALL 就地报错，SHALL NOT 记录任何事件。SMTP 调用路径必须有超时与异常路径的测试，测试必须验证不会真实发信。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py tests/test_email_client.py` → expected: 全部通过，覆盖发送成功写入 email 渠道事件/发送失败不写入/SMTP 未配置报错/超时参数存在
- **Code**: 新增 `backend/app/email_client.py::send_email()`，失败统一抛 `EmailSendError`，`smtplib.SMTP(..., timeout=10)`（design.md 决定 2）；新端点 `POST /api/nudge/send-email` 直接写 `NudgeEvent(channel="email")`，不经过 `_channel_for`（design.md 决定 1/3）；测试用 `unittest.mock.patch("app.routers.nudge.send_email")` 整体替换，不发真实网络请求
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/nudge-email-send/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `backend/tests/test_email_client.py`：新建文件，测试 `send_email()` 在 `SMTP_USER`/`SMTP_PASSWORD` 未设置时抛 `EmailSendError`；此时模块不存在，测试应失败（import error）
- [x] 1.2 GREEN — 新建 `backend/app/email_client.py`：`EmailSendError` 异常类 + `send_email(to, subject, body)` 函数，读环境变量、未配置时抛错
- [x] 1.3 RED — 新增用例：mock `smtplib.SMTP` 让其 `send_message` 抛 `smtplib.SMTPException`，断言 `send_email()` 捕获后重新抛出 `EmailSendError`（不是原始异常类型冒泡）
- [x] 1.4 GREEN — 实现 `send_email()` 里的 try/except 包装，`smtplib.SMTPException`/`OSError` 统一收成 `EmailSendError`
- [x] 1.5 RED — 新增用例：mock `smtplib.SMTP` 正常返回，断言 `send_email()` 调用时传了 `timeout=10`（超时参数必须存在，不是默认无限等待）
- [x] 1.6 GREEN — 确认 `smtplib.SMTP(host, port, timeout=10)` 调用带上超时参数（多数情况下 1.2/1.4 已经覆盖，这一步用于确认边界）
- [x] 1.7 RED — `backend/tests/test_nudge.py`：新增用例，`patch("app.routers.nudge.send_email")` 让其正常返回，POST `/api/nudge/send-email` 应 201，且该学员历史新增一条 `channel=email` 的 `nudged` 记录；此时端点不存在，断言应失败（404）
- [x] 1.8 GREEN — `backend/app/schemas.py` 加 `NudgeSendEmailRequest{student_email, course_id, body}`；`nudge.py` 新增 `send_nudge_email` 端点，成功后直接写 `NudgeEvent(event_type="nudged", channel="email")`（不调用 `_channel_for`）
- [x] 1.9 RED — 新增用例：某学员微信已对齐（`wechat` 非空），仍走 `/api/nudge/send-email` 成功，断言返回的 `channel` 是 `"email"` 不是 `"wechat"`（对应"微信已对齐的学员走发送邮件，渠道仍记为邮件"这条 spec scenario）
- [x] 1.10 GREEN — 确认端点写入的 `channel` 硬编码 `"email"`，不读 `_channel_for`（多数情况下 1.8 已经覆盖，这一步用于确认边界）
- [x] 1.11 RED — 新增用例：`patch("app.routers.nudge.send_email")` 让其抛 `EmailSendError`，断言端点返回 502，且该学员的催促历史**不**新增任何记录（发送失败不落库）
- [x] 1.12 GREEN — 端点 try/except `EmailSendError` → `raise HTTPException(502, ...)`，确保这个分支在写 DB **之前**
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：发送邮件按钮 + 确认对话框

### Contract
- **Spec**: 详情面板 SHALL 提供"发送邮件"入口，点击后 SHALL 弹确认对话框显示目标邮箱，取消 SHALL NOT 触发发送。确认后 SHALL 调用发送邮件接口，成功后历史立刻多一条记录不需要额外点击，失败时就地显示错误信息。（`specs/nudge/spec.md`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient` → expected: 全部通过，覆盖确认框显隐/确认后调用发送/取消不发送/失败报错不影响其他按钮
- **Code**: `NudgeClient.tsx` 的 `DetailPanel` 新增 `showConfirm` state + 手写 modal（同 `ImportDialog` 的 `fixed inset-0 z-50 ... bg-black/30` + `role="dialog"` 模式，design.md 决定 4）；`actions.ts` 新增 `sendNudgeEmail`；`api.ts` 新增对应 fetch 封装，失败复用既有 `BackendError`/`classify` 模式把 502 detail 透传成界面文案
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/nudge-email-send/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `frontend/app/(app)/nudge/NudgeClient.test.tsx`：新增用例，点击"发送邮件"按钮，断言出现确认对话框且显示该学员邮箱；此时没有这个按钮，测试应失败
- [x] 2.2 GREEN — `DetailPanel` 加"发送邮件"按钮 + `showConfirm` state + 确认对话框 markup（显示邮箱，确认/取消两个按钮）
- [x] 2.3 RED — 新增用例：确认对话框里点取消，断言不调用 `sendNudgeEmail`，对话框关闭
- [x] 2.4 GREEN — 取消按钮的 `onClick` 只 `setShowConfirm(false)`，不触发发送
- [x] 2.5 RED — 新增用例：确认对话框里点确认，断言 `sendNudgeEmail` 被调用且参数为学员邮箱/课程 id/当前草稿文本
- [x] 2.6 GREEN — 确认按钮的 `onClick` 调用 `sendNudgeEmail(person.studentEmail, person.courseId, draft)`
- [x] 2.7 RED — 新增用例：`sendNudgeEmail` mock 返回失败，断言详情面板显示错误信息（复用既有 `error` state 展示模式）
- [x] 2.8 GREEN — 发送失败时 `setError(outcome.message)`，复用既有错误展示 UI
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [x] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [x] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [x] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [x] 3.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查；额外确认 `grep -rn 'SMTP_PASSWORD\|SMTP_USER' frontend/` 无匹配——凭证不该出现在前端代码里）
