## Context

`enrollment-core` 已上线：`enrollments` 表（`student_email` × `course_id` × 可空 `session_id`，
带 `enrolled_at` / `status` / `source` / `note`）、两条 partial unique index、
`GET/POST/PATCH/DELETE /api/enrollments`、场次删除守卫、学员详情的报课区块（**只能看与新增**）、
课程页的三个计数。生产库**一条报课都没有**。

数据源实测（2026-07-30）：

```
ai-course/tools/homework-grader/session1/grades.csv  18 行 / 17 人 → S1
                                     session2         9 行 /  9 人 → S2
                                     session3         1 行 /  1 人 → S3
                                     session4         0 行         → 不导（映射无证据）
列：姓名, 邮件, 提交时间, 总分, <各评分项>
21 人涉及，5 人不在学员库 → 可建 14 + 8 + 0 = 22 条
```

`source` 列是 `text`，**没有 CHECK 约束**（与 `region`/`level` 同一判断：给未来留口子），
所以加第三个值不需要 migration。

## Goals / Non-Goals

**Goals:**

- `source` 支持 `derived`，取值在 API 边界受限
- 一次性脚本把 22 条报课倒推进生产
- `/enroll` 只读总表
- 学员详情能逐条改场次 / 删除

**Non-Goals:**

- 平台导入三通道、待处理队列、批量指派（`enrollment-import`，阻塞）
- 总表可编辑
- 自动新建学员
- 导入作业成绩本身

## Decisions

### 1. 权威源是 `grades.csv`，不是 Notion

用户最初说"从 Notion 的作业成绩"倒推。但 `docs/superpowers/specs/2026-07-29-notion-import-design.md:31`
记着：Notion 那 19 条「作业」记录**本身**是 `sync_to_notion.py` 从这些 CSV 生成的衍生数据。
读 Notion 是绕道读一份有损副本，且要重新处理 Notion 的分页与字段映射。直接读 CSV。

CLAUDE.md 的数据来源表本来就是这么写的（作业成绩 ← `grades.csv`）。

### 2. `session4` 不导，且不断言它映射到 S4

该文件 0 行，表头是 `K1网站上线 / K2Brief具体性 / K3内容真实性 / K4设计一致性 / L1截图完整性 /
M1心得字数 / M2心得深度 / 加分Demo` —— 与 session3 高度重合，而 S4 是「AI 炒股分析系统」，
评分项本应完全不同（`/ticker-scan`、`/market-daily` 那类）。

**这条映射没有证据**。0 行所以不影响导入结果，但脚本 SHALL NOT 假装它成立：
跳过并说明原因，而不是静默略过。

（CLAUDE.md 里"S4 是 K1–M2 共 8 项"那句多半正是照这份可疑表头写的。归档时一并存疑。）

### 3. 课程靠别名查，不靠目录名硬编码

`session1` → 别名 `s1` → `course_id`，走与 `tools/course-import` 相同的归一化路径
（`normalize_alias`）。别名查不到就**中止并报告**，不猜。

硬编码 `{"session1": "S1", ...}` 看起来更短，但它把"目录名与课程的对应关系"变成了
脚本里的一个秘密：课程改名或别名调整时，脚本会继续按旧映射写入而没有任何征兆。

### 4. `enrolled_at` 取该课程最早一场的日期

作业成绩里没有报名时间；`提交时间` 必然晚于报名。取最早一场的日期，语义是"这一期的人"。

它仍是推出来的值 —— 这正是 `source = derived` 要标记的：看到这条记录的人应当知道日期不可信。
**课程没有任何场次时中止**：没有日期可取，编一个（比如今天）会让这条记录看起来像今天报的。

### 5. 重跑幂等靠数据库，不靠脚本自觉

第二次跑时 `enrollments_unique_undecided` 会拒绝重复的未定场次记录。脚本把这类冲突
计为"已存在，跳过"而不是失败退出。

因此脚本**不需要先查一遍再决定写不写** —— 那是 TOCTOU，且多一轮往返。直接写、按 409 归类。

同一门课交两次的那位（session1 的 18 行 17 人）因此天然只得一条。

### 6. 未匹配的学员：跳过并列出，不自动建档

`students` 的 `region` / `level` / `source` 都是 NOT NULL，而 CSV 只有姓名与邮箱。
自动建档就得给这三项编值 —— 与刚从界面上清掉的"4 / 6 假数字"是同一件事。
且 CLAUDE.md 明写姓名可能是群昵称残留。

脚本列出这些邮箱（**只列邮箱，不列姓名**），人工补建后重跑。

### 7. 总表只读，写入仍只在学员详情

`/enroll` 从占位页改为真实页面。`app/(app)/placeholder-routes.test.tsx` 里断言
「报课渲染其占位页」的用例要跟着改 —— 不改的话它会红，而红的原因看起来像"占位页坏了"。

**不在总表上放编辑入口**：同一件事两条写入路径，两边会慢慢长出不同的校验
（这个项目在学员写入上吃过一次亏）。总表回答"有哪些"，学员详情回答"改这一条"。

### 8. 逐条编辑复用场次行的形状

`EnrollmentRows` 每条增加「改场次 / 删除」。实现约束与 `SessionRows` 相同，
且是这套界面反复出问题的地方：

- 错误状态按**报课 id** 分开存，失败信息渲染在**那一条**上
- 写入期间禁用该条的**所有**出口（含取消）
- 关闭编辑态只在成功回调里做
- 测试用**挂住不 resolve 的 promise** 断言 `disabled`；只断言最终态对这类回归全盲

这些不入 spec（见 `student-roster` delta 的说明），但写进各组 Contract 的 Code 字段。

## Risks / Trade-offs

- **[别名归一化实测才知道]** → `S1` 是导入课程时建的，大小写/空格的处理只有实跑能确认。
  apply 阶段用真实的 `course_aliases` 验，不靠读代码
- **[重跑幂等要真跑第二遍]** → 代码里有 try/except ≠ 数据库真的挡住了。
  `NULL != NULL` 那条坑的教训就是二者是两件事
- **[占位页测试会红]** → 预期之内，跟着改；但要认出它是预期的，别当成缺陷去查
- **[22 条全是未定场次，课程页看起来"没人报"]** → 场次卡片不显示数字（都为 0），
  信息全在课程层的「另有 N 人未定场次」上。这是设计如此，生产验收要专门确认这一点，
  否则会被误读为导入没成功
- **[`source` 无 DB CHECK]** → 取值只在 API 边界挡。绕过接口直写仍可能写进第四种值；
  接受（与 `region`/`level` 同一权衡），但只读响应用 `str` 而非 `Literal`

## Migration Plan

**无 schema 变更**（`source` 已是 `text`）。前后端各自部署，顺序不敏感。

脚本单独跑：dry-run → 人工确认 → `--apply`。它写的是生产数据，不是部署的一部分。
回滚 = 按 `source = 'derived'` 删除（脚本提供 `--undo`？**不提供** ——
删除报课有界面入口，22 条也不算多；一个只在出错时才跑的删除路径，本身就是没被测过的危险代码）。

## Open Questions

（无阻塞项。以下为已定边界：）

- 权威源是 `grades.csv`；`session4` 不导且不断言映射
- `enrolled_at` 取课程最早一场；无场次则中止
- 未匹配学员跳过并列出，不自动建档
- 总表只读；逐条编辑在学员详情

**留给 apply 实测、不得默认成立**：别名归一化是否匹配得上；重跑是否真的幂等。
