# Student Management System — Design Spec

**Date:** 2026-06-21  
**Status:** Approved for implementation  
**Approach:** Notion-first (Phase 1), migrate to custom web app (Phase 2)

---

## Goal

Track engaged students across three dimensions: homework quality, question activity, and 1:1 interactions. Shareable with co-instructors. Extensible to interest groups and consulting.

## Architecture

**Phase 1 — Notion as source of truth**  
Two Notion databases, synced from Claude Code via Notion MCP.

**Phase 2 — Custom web app**  
Migrate Notion data to PostgreSQL. Same schema, no redesign needed.

---

## Data Model

### Database 1: 学员库 (Students)

| Field | Type | Notes |
|-------|------|-------|
| 姓名 / 昵称 | Text | Display name |
| 邮箱 | Email | Homework submission email |
| 微信 | Text | WeChat ID |
| 课程 | Multi-select | S1 / S2 |
| 作业质量 | Rating 1–5 | Auto-synced from grades.csv |
| 问题活跃度 | Number | Cumulative question count |
| 1:1 次数 | Number | Count of 1:1 sessions |
| 标签 | Multi-select | 优秀学员 / 潜在TA / 咨询客户 / 兴趣小组候选 |
| 备注 | Long text | Free-form notes |

### Database 2: 互动记录 (Interactions)

| Field | Type | Notes |
|-------|------|-------|
| 学员 | Relation → Students | |
| 类型 | Select | 作业 / 问题 / 1:1 / 微信 |
| 日期 | Date | |
| 摘要 | Text | |
| 质量 | Rating (optional) | For homework entries |
| 来源 | Select | 邮件 / 微信 / Zoom |

---

## Claude Code Integration

### Directory structure

```
ai-course/tools/student-sync/
  sync-to-notion.py     # Parse grades.csv + submissions → upsert Notion records
  SKILL.md              # /student-note skill definition
  config.json           # Notion DB IDs, field mappings
```

### Three ingestion paths

**Path 1 — Homework auto-sync**  
After grading, run `sync-to-notion.py`. Reads `tools/homework-grader/session*/grades.csv` and submission `.md` files. Creates or updates student record in 学员库; appends one "作业" row to 互动记录.

**Path 2 — 1:1 quick entry (`/student-note` skill)**  
Austin types a natural-language note (e.g. "刚和 Sharon 通话了 30 分钟，聊 ISO 行权策略"). Claude parses name, duration, topic → writes to 互动记录, increments 1:1 次数 in 学员库.

**Path 3 — Email / WeChat question tracking (semi-auto)**  
- Email: Gmail MCP scans austin.aicourse@gmail.com; Claude identifies student questions → logs to 互动记录, increments 问题活跃度.  
- WeChat: Manual paste into `/student-note`; same parse-and-log flow.

---

## Permissions

| Role | Phase 1 (Notion) | Phase 2 (web app) |
|------|-----------------|-------------------|
| Austin | Full edit | Admin |
| Co-instructor | Full edit | Editor |
| Student | No access | Read own record only |

---

## Future Extensions

- **兴趣小组:** Add `兴趣小组` multi-select field to 学员库; filter view per group.
- **咨询客户:** Add `咨询状态` field (无 / 潜在 / 活跃). Consulting system reuses 学员库, no new table.
- **Phase 2 migration:** Export Notion → import to PostgreSQL. Fields map 1:1 to columns. Students DB + Interactions DB → two relational tables with foreign key.

---

## Out of Scope (Phase 1)

- Student-facing login or portal
- Automated WeChat parsing
- Payment or enrollment tracking
