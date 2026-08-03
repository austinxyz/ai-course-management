## Context

批改工具在 `ai-course/tools/homework-grader/session*/submissions/` 产出的
`{姓名}_{日期}_report.md` 是纯文本，格式是一张 Markdown 表格（维度｜得分｜满分｜
评语）加几个 `###` 小标题段落（亮点、改进建议、讲师回复草稿、作业原文）。本变更
只解析表格与"亮点"/"改进建议"两段，其余段落忽略。

本项目规定不做运行时跨仓库依赖——上传是浏览器读取用户选中的文件字节，发给后端，
不是后端去读另一个仓库的文件系统。

## Goals / Non-Goals

**Goals:**
- 纯函数解析层（参照 `homework_parsing.py` 的既有模式），不碰数据库、不碰文件系统
- 预览与写入复用同一套 `dry_run` 约定（跟 `grades.csv` 导入同一个模式），预览时
  不写入，确认时重新提交同一份内容 + 勾选结果
- `_classify` 的整行覆盖逻辑加一处例外判断，不改变它对其余字段的行为

**Non-Goals:**
- 不做"讲师回复草稿"、"作业原文"的解析
- 不做批量/文件夹导入
- 不做修改历史留痕

## Decisions

**1. 新增纯函数解析模块 `backend/app/homework_report_parsing.py`。**

跟 `homework_parsing.py` 同一个理由：解析格式、分类逻辑最容易悄悄出错，且错了
从页面上看不出来，纯函数、独立可测。

解析规则：
- 表格行 `| A1 工作流结构 | 13 | 15 | 评语文字 |` —— 第一列取开头的编号前缀
  （正则 `^([A-Z]\d+)`），忽略后面的中文标题；第二、三列是得分/满分；第四列是评语
- `### 亮点` 到下一个 `###` 标题之间的内容作为亮点原文
- `### 改进建议` 到下一个 `###` 标题之间的内容作为改进建议原文
- 表格一行都解析不出时 SHALL 拒绝（`422`，说明"这看起来不是批改报告"），
  参照 `homework_parsing.py` 里 `BadHeader` 的错误设计——错误要说得出"可能传错了文件"

**2. 数据模型：`HomeworkSubmission` 新增两列。**

```sql
ALTER TABLE homework_submissions
  ADD COLUMN dimension_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN highlight_locked boolean NOT NULL DEFAULT false;
```

`dimension_comments` 跟 `scores`同一个形状（`[{item, comment}]` 数组）——只存
被勾选写入的那些分项，不是全量镜像整份报告。`highlight_locked` 是那个"这条提交的
highlight/improve 是不是来自报告导入、`grades.csv` 重新导入不能碰"的标记；两个字段
（highlight、improve）共用一个锁，因为需求里两者是绑在一起生效的，不需要两把锁。

**3. 端点复用 `dry_run` 约定，不新增"两阶段状态"。**

```
POST /api/homework/submissions/{id}/report?dry_run=true|false
body: {
  content_base64: str,
  accepted_items: list[str] | null   # 只在 dry_run=false 时读取
}
```

`dry_run=true`：解析、返回预览（逐分项评语+得分对比警告+亮点+改进建议），不写入。
`dry_run=false`：重新解析同一份 `content_base64`（前端把上传时的内容原样带过来，
不依赖服务端记的临时状态），按 `accepted_items` 过滤要写入的分项评语，写入
`dimension_comments`、覆盖 `highlight`/`improve`、把 `highlight_locked` 设为 `true`。

备选：服务端在 dry_run 阶段生成一个临时 token，确认时只传 token + 勾选结果。
放弃：多一套临时状态存储（内存或表），且这个功能没有"预览之后过很久再确认"的
使用场景（讲师是同一次交互里点完），复杂度不值。跟 `grades.csv` 导入"重新提交同一份
内容"是同一个模式，前端已经有处理大文件 base64 的既有代码可以直接复用。

**4. `_classify` 加一处例外：`found.highlight_locked` 为真时，写入循环里
从 `fields` 剔除 `highlight`/`improve` 两个键。**

```python
if found is not None and found.highlight_locked:
    fields = {k: v for k, v in fields.items() if k not in ("highlight", "improve")}
```

只在**更新既有记录**这条路径加，不影响新建记录（新记录不可能已经被锁）。

## Risks / Trade-offs

- **[风险] Markdown 表格格式如果批改工具以后改了（比如列顺序变了），解析会
  静默解出错的值** → 缓解：解析层对每个单元格做类型校验（得分/满分必须是整数），
  校验不过直接 422，不吞错；表格一行都解不出时整份拒绝。跟 `grades.csv` 解析层
  同一套纪律。
- **[风险] `accepted_items` 由前端传回，理论上可以伪造出一个跟预览不一致的列表**
  → 接受：这是内部工具，讲师自己操作自己的数据，不是一个需要防范恶意调用方的
  场景（跟 `grades.csv` 导入的既有信任边界一致）。

## Migration Plan

新增两列，均有默认值（`'[]'::jsonb` 和 `false`），无需回填，不锁表。部署后
立即生效——已有的提交记录默认 `highlight_locked=false`，行为与本变更之前
完全一致，直到讲师主动上传一次报告。回滚：`ALTER TABLE ... DROP COLUMN`，
安全，没有其他表引用这两列。

## Open Questions

（无——explore 阶段的 Open Questions 已在这里定：解析出的分项与 `scores` 按
编号前缀对齐；`dry_run` 复用既有约定而不是新开一套两阶段状态。）
