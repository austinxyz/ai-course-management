---
Date: 2026-07-30
Change: roster-order-spec
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-07-30-roster-order-spec-requirements.md
---

## Why

学员名单的排序（`ORDER BY name, email`）是 2026-07-30 上午按缺陷直接修的，
**没有留下依据**——为什么按姓名、为什么要有兜底键，只存在于那次对话里。
`course-list-order` 记下了这个洞，两次归档过去仍在。补它的实际理由：
课程列表的排序规则已经写明（按最早场次倒序、未排课优先），学员这条空白，
而两者取值恰好相反；没有依据的话，"统一一下"看起来会像是改进。

## What Changes

- `student-roster` 增加一条「学员名单的排序」需求（ADDED），写明规则、兜底键与理由
- **无代码改动。** 实现与两个测试都已存在且通过

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `student-roster` —— 新增一条排序需求。既有需求一律不动；用 ADDED 而非 MODIFIED
  既有的「学员列表查询」，因为那条讲的是"返回哪些字段"，与顺序是两件事

## Impact

- 仅 `openspec/specs/student-roster/spec.md`（经 archive 应用）
- `backend/` 与 `frontend/` **零改动**

## Out of Scope

- 改排序规则本身（姓名升序是现状，本 change 只是把它写下来）
- 前端排序、手动排序、可配置排序
- 归档名单另立排序条目（同一端点、同一规则）
