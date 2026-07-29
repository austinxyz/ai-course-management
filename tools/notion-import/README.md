# Phase 1 Notion 学员导入

一次性脚本：把 Notion「学员库」中有邮箱的记录导入 `students` 表。
设计见 [docs/superpowers/specs/2026-07-29-notion-import-design.md](../../docs/superpowers/specs/2026-07-29-notion-import-design.md)。

## 安装

```bash
pip install -r tools/notion-import/requirements.txt
```

## 环境变量

运行时由讲师从自己的 shell 提供，**不入库、不入仓**：

| 变量 | 说明 |
|---|---|
| `NOTION_API_KEY` | Notion integration token，需把「学员库」共享给该 integration |
| `BACKEND_URL` | FastAPI 地址，如 `https://<service>.onrender.com` |
| `BACKEND_SECRET` | `X-Backend-Secret` 头的值 |
| `NOTION_STUDENT_DB_ID` | 可选，覆盖默认库 id（用于指向测试库） |

## 两条读 Notion 的路

Phase 1 从来没配过 integration token —— 学员库一直走 Notion MCP
（`ai-course/docs/student-management-guide.md`）。独立脚本连不上 MCP，所以有两条路：

**A. MCP 导出（无需 token）** —— 在 agent 会话里查：

```sql
SELECT "姓名", "邮箱", "微信", "备注", "标签" FROM "collection://1a5814e8-7763-4a14-b9d9-fc0f6b75b715"
```

把结果存成 `rows.json`（**放仓库外**，是真实学员数据），然后：

```bash
python tools/notion-import/mcp_rows_to_pages.py rows.json pages.json
python tools/notion-import/import_students.py --pages-file pages.json
```

适配器只做 shape 转换，映射与冲突判断仍由被测过的 `mapping.py` / `import_students.py` 执行。

**B. integration token** —— 建了 token 就不需要中间文件，直连 Notion（见下方环境变量）。

## 用法

默认 dry-run，只读不写：

```bash
python tools/notion-import/import_students.py
```

实跑（唯一会写入的路径）：

```bash
python tools/notion-import/import_students.py --apply
```

`--reveal` 打印完整邮箱。默认打码，因为 dry-run 输出会留在终端回滚、CI 日志和对话记录里
（CLAUDE.md §隐私）。只在本地逐字段核对那一步用它。

## 验证顺序

脚本直接写生产库，dry-run 是唯一防线，因此按此顺序：

1. 对生产库跑 dry-run —— 确认 18 条待建、0 冲突，且生产库记录数不变
2. `NOTION_STUDENT_DB_ID` 不变、`BACKEND_URL` 指向**本地** Supabase 后端，`--apply --reveal`
   实跑一遍，逐字段核对（尤其两处 `作业优秀` 与全量 `Phase1导入`）
3. 本地重跑一次 —— 18 条应全部报 `email already exists` 跳过，记录数不变
4. 最后才对生产 `--apply`

## 语义

- **跳过而非覆盖**：邮箱已存在（含已归档）时返回 409，脚本记为跳过，不改任何字段。
  重跑安全。
- **无邮箱的记录不处理**：邮箱是主键，也是与 `grades.csv` / EliteCoach101 的 join key。
- 未映射的 Notion 标签一律丢弃，不会凭空造出新分类。

## 测试

```bash
python -m pytest tools/notion-import
```

映射逻辑（`mapping.py`）是纯函数，测试夹具全部虚构。网络部分不在测试覆盖内 ——
它是一次性脚本的 I/O 外壳，真正的防线是 dry-run。
