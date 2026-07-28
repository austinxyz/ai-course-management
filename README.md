# 学员管理系统

北美华人 Claude AI 课程的学员档案、报课、作业与互动管理。供讲师与合作伙伴使用，不面向学员。

## 现状

**需求已确认，尚未开始实现。** 下一步是 opsx explore。

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
