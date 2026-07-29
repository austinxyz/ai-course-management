---
Date: 2026-07-29
Change: access-control
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-07-29-access-control-requirements.md
---

## Why

`deployment` change 有意把系统留在公网裸奔状态——当时安全的唯一理由是生产库空着。实测确认暴露面比预想更宽：
页面、API、以及 `/docs` 与 `/openapi.json` 全部 200，后两者等于把字段名（`wechat`、`email`、`nick`）
告诉任何人，即"这里存着什么类型的个人信息"。

这个 change 关掉它。它也是解除"不得导入真实学员数据"那条硬护栏的前置条件——在它落地之前，
报课、作业、催作业等后续能力都无法用真实数据推进。

## What Changes

- 新增 Next.js `proxy.ts`（本版已把 `middleware` 约定弃用并改名为 `proxy`）：整站 HTTP Basic Auth
  （共享密码），默认全拦、matcher 显式排除静态资源
- FastAPI 新增共享 secret header 校验：默认覆盖所有路由，只有自家 Next.js 能调通
- 生产环境关闭 FastAPI 的 `/docs` 与 `/openapi.json`（本地开发保留）
- `frontend/lib/api.ts` 在 server-side fetch 时注入 secret header
- 扩充 `openspec/config.yaml` 的泄露检查，覆盖新增的认证类变量名
- `.env.example`（前后端）新增对应变量

**无 BREAKING 变更** —— `student-roster` 的 API 契约与页面行为在通过认证后与本 change 之前完全一致。

## Capabilities

### New Capabilities

- `access-control` —— 未授权请求的拒绝行为、配置缺失时的 fail-closed 方向、以及后端只接受自家前端调用

### Modified Capabilities

（无。`student-roster` 的对外契约不变——变的是"能不能走到它面前"，不是"它返回什么"。）

## Impact

- `frontend/proxy.ts` —— 新增（**不是** `middleware.ts`，该约定在本版已弃用）
- `frontend/lib/api.ts` —— 注入 secret header
- `backend/app/main.py` —— 生产关闭 docs/openapi
- `backend/app/` —— 新增 secret 校验依赖（具体落点由 design 决定）
- `.env.example`（前后端）、`openspec/config.yaml` —— 新增变量与检查项
- 平台侧（不在仓库内）：Vercel 与 Render 各自新增环境变量

## Out of Scope

- **每人一个身份**（邮箱白名单 / magic link / OAuth）—— 讲师与合作伙伴共用一个密码；
  因此无法单独吊销某人，也无法在互动记录里区分录入者。CLAUDE.md 认证章节已定"不做多用户隔离"
- **限流 / 防暴力破解** —— 未纳入。安全性依赖"密码本身足够长"这一前提
- **登出功能** —— Basic Auth 无此概念
- **解除"禁止导入真实学员数据"护栏** —— 有意留到真要导数据时单独、明确地解除，
  而非随本 change 自动失效（见 requirements 的 Open Questions）
- **区分认证失败与后端休眠的错误文案** —— 已知代价，见 requirements 的「已知代价」一节
