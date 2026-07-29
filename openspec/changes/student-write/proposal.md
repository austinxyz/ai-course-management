---
Date: 2026-07-29
Change: student-write
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-29-student-write-requirements.md
---

## Why

学员名单页从 claude.ai/design 导入时就带着完整的编辑控件——逐字段改、打标签、写备注、新增、归档——
但它们只改本地 React state，**刷新即失**。界面看起来能用，实际什么都没存下来。

`student-management` 只接了读，`deployment` 与 `access-control` 分别解决了上线与鉴权。
现在这些控件是这个系统里唯一"看着能用其实不能用"的部分，也是往后所有数据录入的前提。

## What Changes

- 新增 `archived_at timestamptz` 列（现有 13 列里没有任何表示归档状态的字段）
- FastAPI 新增写端点：字段更新、新增学员、归档、恢复
- 前端新增 Server Actions 作为写入通路（浏览器不直连 FastAPI），**每个 Action 内部独立校验凭据**
- `StudentsClient` 的五处写操作从改本地 state 改为调 Server Action，并新增"保存中 / 保存失败"状态
- 新增学员时若邮箱属于**已归档**学员 → 报错引导，不自动恢复也不覆盖

**无 BREAKING 变更** —— 既有读端点契约不变。归档列有默认值，既有行不受影响。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `student-roster` —— 该能力目前只有读契约。本 change 为其补上写契约：字段更新、新增、
  归档/恢复的行为，以及写入面的鉴权要求。读契约本身不变。

## Impact

- `supabase/migrations/` —— 新增 migration（`archived_at`）
- `backend/app/models.py`、`schemas.py`、`routers/students.py` —— 写端点与请求体校验
- `frontend/app/students/actions.ts` —— 新增，Server Actions
- `frontend/app/students/StudentsClient.tsx` 及 `DetailPanel` / `NewStudentModal` —— 接线 + 新状态
- `frontend/lib/api.ts` —— 新增写方法
- 生产库：验收期间会临时存在一条虚构测试记录，验完直连数据库清除

## Out of Scope

- **乐观更新** —— 提交后等服务器确认；不做即时反馈 + 回滚
- **并发控制** —— 两人同改一条，后写的赢。不加版本号、不加锁、不提示冲突
- **硬删除** —— 只有归档（软删除）。UI 已声明"硬删除需超管权限"，本 change 不新增删除端点；
  后果是清理误建记录只能直连数据库
- **修改邮箱** —— 主键且 UI 已声明不可修改
- **审计日志** —— 共用一个密码，本来也区分不出操作者
- **批量编辑**
- **报课 / 作业 / 催作业相关写入** —— 各自独立 change
- **解除"禁止导入真实学员数据"护栏** —— 仍是单独、明确的决定
