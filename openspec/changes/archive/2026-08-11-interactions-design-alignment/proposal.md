---
Date: 2026-08-10
Change: interactions-design-alignment
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-10-interactions-design-alignment-requirements.md
---

## Why

上一轮 `interactions-manual-entry` 上线后发现，权威设计稿（`ClaudeAI课程学员管理页.dc.html` 的 `isInteractions` 区块）其实早就画好了完整的互动记录页——手动录入是页面右侧常驻的"记一条"面板，类型是事情性质（1:1 沟通/咨询/技术支持/作业反馈）而不是渠道，筛选是来源 tab + 搜索框，还有一类我们完全没做的"参与度信号"快捷打标。这次对齐设计稿，同时补上参与度信号。

## What Changes

- **BREAKING**：手动录入的分类维度从"渠道二选一（微信/邮件）"整体换成"事情性质四选一（1:1 沟通/咨询/技术支持/作业反馈）"——`channel` 字段从手动录入的请求体里移除
- **BREAKING**：手动录入的课程选择从"讲师从下拉选该学员已报的课"改成"后端自动取该学员未退课报课记录里 `enrolledAt` 最大的一条"——请求体不再收集 `course_id`
- 手动录入的入口从学员详情面板的弹窗，改成互动记录独立页右侧的常驻面板
- 新增"参与度信号"：5 个固定标签（出席直播/加入兴趣小组/兴趣小组长/兴趣小组积极发言/Demo Day 参展），选中学员后点击即写入，课程同样自动取最新报课
- 独立页筛选从"学员下拉 + 时间范围预设"换成"来源 tab（全部/系统自动/人工录入/参与度）+ 搜索框（学员/类型/内容）"
- 列表行新增来源徽标（区分三类来源）与右侧归属列（人工录入/参与度固定"Austin"）
- 写入成功后顶部出现"已写入"提示条
- 从 `nudge` 页跳转过来的深链接改成预填搜索框，不再预选学员下拉（因为下拉已经不存在）
- 学员没有任何未退课报课记录时，手动录入与参与度信号的提交入口都被禁用并给出说明文案

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `interactions`：手动录入的数据模型（类型维度、课程自动推导）、入口位置、独立页筛选方式全部改变；新增参与度信号来源

## Impact

- `backend/app/schemas.py`：`ManualInteractionCreate` 移除 `channel`/`course_id`，新增 `type`（四选一枚举）；新增参与度信号的写入 schema
- `backend/app/routers/interactions.py`：手动录入端点改造；新增参与度信号写入逻辑（复用同一张表，新的 `event_type`/`note` 表达方式，design 阶段定）；新增"取该学员最新未退课报课"的查询逻辑
- `backend/tests/test_interactions.py`：改写手动录入相关测试，新增参与度信号测试
- `frontend/app/(app)/students/ManualInteractionModal.tsx`：删除（功能搬到独立页）
- `frontend/app/(app)/students/DetailPanel.tsx`：移除"+ 手动记录"入口
- `frontend/app/(app)/students/StudentsClient.tsx`：移除手动录入弹窗相关状态与渲染
- `frontend/app/(app)/students/actions.ts`：移除 `createManualInteractionAction`（或按新数据模型改写，视 design 阶段决定）
- `frontend/app/(app)/interactions/InteractionsClient.tsx`：大改——去掉学员下拉+时间预设，加来源 tab、搜索框、常驻"记一条"面板、参与度信号区块、"已写入"toast
- `frontend/app/(app)/interactions/page.tsx`：`?student=` 深链接改成预填搜索框
- `frontend/app/(app)/nudge/NudgeClient.tsx`：确认"查看互动记录"链接跳转后的表现仍然正确
- `frontend/lib/api.ts`：手动录入的写请求封装改造；新增参与度信号写请求封装

## Out of Scope

- "答疑"作为第四类来源——留到未来的变更
- 参与度信号标签的后台可配置——固定写死
- 多用户身份/归属——固定"Austin"
