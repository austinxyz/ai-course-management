# 学员管理系统

北美华人 Claude AI 课程的学员档案、报课、作业与互动管理。供讲师与合作伙伴使用，不面向学员。

## 现状

**已上线**：https://ai-course-management.vercel.app/students

学员名单只读查询跑在 Vercel + Render 免费档 + Supabase 云库上（`student-management` 与
`deployment` 两个 change，均于 2026-07-29 归档）。`git push main` 后代码由平台自动部署，
数据库 migration 由 GitHub Actions 自动推送。

编辑/归档/新增学员、报课、作业、催作业等能力还没做。

> ⚠️ **目前没有任何访问控制，页面公网可读。**
> 因此生产库刻意保持空表——`supabase/seed.sql` 是本地专用文件，`supabase db push` 不会推送它。
> **在访问控制 change 落地之前，不要往生产库导入任何真实学员数据。**

> 后端跑在 Render 免费档，15 分钟无请求会休眠。冷启动约需 1 分钟，
> 期间页面会显示"暂时无法加载"并提供重试按钮——这是预期行为，不是故障。

本地跑起来见 [docs/setup.md](docs/setup.md)。

## 要解决什么

现有的 Notion 方案（Phase 1）能存作业成绩，但：

- **没有报课数据** → 算不出"谁该交作业但没交"
- **微信字段全空** → 催作业时拿不到联系方式
- **不适合批量运算** → 算名单、批量起草邮件都要反复调 API

核心目标是让**催作业自动化**：算出未交名单 → 起草个性化文案 → 发邮件 → 记录已催。

## 文档

| 文件 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | Phase 2 需求（本项目要建的） |
| [docs/phase1-notion-design.md](docs/phase1-notion-design.md) | Phase 1 设计（已上线的 Notion 方案，作为背景） |
| [CLAUDE.md](CLAUDE.md) | 架构纪律、领域约束、开发流程 |

## 技术栈

```
浏览器 → Next.js 15 (App Router) → FastAPI (Python 3.12) → Supabase 托管 Postgres
```

浏览器不直连后端，也不直连数据库。详见 [CLAUDE.md](CLAUDE.md) 的架构纪律。

## 开发流程

走 opsx 四阶段：`explore → propose → apply → archive`。

## 隐私

本系统处理真实学员个人信息。仓库不提交任何真实学员数据，测试一律使用虚构姓名与 `@example.com` 邮箱。
