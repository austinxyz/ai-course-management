---
Date: 2026-08-05
Change: nudge-email-send
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-08-05-nudge-email-send-requirements.md
---

## Why

`nudge` 目前只能起草文案，讲师自己复制粘贴到邮箱里发。用户直接反馈想要系统真的能代发——固定用一个专用 Gmail 账号（`austin.aicourse@gmail.com`），SMTP + 应用专用密码，不接 OAuth（单人使用，OAuth 的多用户授权价值体现不出来）。

## What Changes

- 详情面板新增"发送邮件"按钮（第三个按钮，与"复制文案"/"标记已催"并列），点击后弹确认对话框，确认后通过 SMTP 把当前草稿发到该学员邮箱。
- 邮件主题固定格式 `《{课程名}》作业提醒`，正文为当前草稿原文，不做额外包装。
- 发送成功后自动记一条 `channel=email` 的 `nudged` 事件，不需要讲师再手动标记。**BREAKING（内部）**：`POST /api/nudge/events` 现状对所有 `nudged` 事件都用 `_channel_for()` 按微信对齐自动判定渠道，不接受调用方指定——真实发信必须绕开这条自动判定，否则一个微信已对齐的学员走"发送邮件"，历史记录会显示成"微信"。
- 发送失败（SMTP 报错/超时/鉴权失败）时界面就地报错，不记录任何事件。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `nudge` —— 新增"真实发信"能力：SMTP 客户端、新的记录路径（绕开 `_channel_for` 自动判定）、详情面板新按钮

## Impact

- `backend/app/routers/nudge.py`：新端点或扩展现有端点，内部调用 SMTP 客户端，成功后写入 `channel=email` 的 `NudgeEvent`（不经过 `_channel_for`）
- `backend/app/`：新增 SMTP 客户端模块（可测试性要求——发送函数必须能在测试里整体替换/mock，不依赖真实网络）
- 环境变量：SMTP 账号、应用专用密码（只走环境变量，不入库，不出现在前端代码里）
- `backend/app/schemas.py`：新增请求/响应 schema（发送邮件的请求体、结果）
- `frontend/app/(app)/nudge/NudgeClient.tsx`：详情面板新增"发送邮件"按钮 + 确认对话框（复用既有 `Dialog` 模式，参考 `ImportDialog`/`ReportUploadDialog`）
- `frontend/app/(app)/nudge/actions.ts`：新 Server Action 调用发送端点
- `frontend/lib/api.ts`：新增对应的 fetch 封装

## Out of Scope

- 多发信账号/多讲师支持、Gmail OAuth——固定一个 SMTP 账号，见 requirements Non-Goals
- 批量发送——沿用"按人逐条操作"
- 发信频率限制/配额管理——单人用量远低于 Gmail 每日上限
- 富文本/HTML 邮件——纯文本，与草稿所见即所得
