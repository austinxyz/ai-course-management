## Context

`backend/app/routers/homework.py` 的 `_classify` 函数把 `grades.csv` 里的每一行分类
（已在册/新建/更新/跳过），`import_homework` 端点组装返回体。当前对"邮箱不在
`students` 表"的行为是加入 `skipped_no_student` 清单、不写入。本变更让这类行
自动建 `Student` + `Enrollment`，正常写入成绩。

不涉及数据库结构变更——`Student.region/level/source`、`Enrollment.session_id/
enrolled_at/source/status` 均为既有列。

## Goals / Non-Goals

**Goals:**
- `_classify` 内一次性完成"发现未知邮箱 → 建档 → 建报课 → 写成绩"，仍然保持
  既有的"成批查询、批量写入"模式（不逐行查库）
- `dry_run=true` 下能算出会自动建哪些人，但不实际执行任何 `session.add`
- 返回体字段从 `skipped_no_student` 改名为 `auto_created`，前端同步

**Non-Goals:**
- 不反推场次（`session_id` 恒为 `None`）
- 不改动 `homework_parsing.py` 的解析/校验逻辑
- 不批量回填历史导入产生的 `skipped_no_student` 记录

## Decisions

**1. 建档时机放在 `_classify` 内部，紧邻现有的 `known`/`enrolled` 批量查询之后。**

现有代码已经为整份文件批量查出 `known`（哪些邮箱在学员表）与 `enrolled`
（哪些邮箱在这门课有报课记录）。未知邮箱集合就是 `emails 中不在 known 的部分`——
不需要额外查询即可得出，只需在写入阶段对这批邮箱先 `session.add(Student(...))`
再 `session.add(Enrollment(...))`，再走原有的成绩写入分支。

备选方案：在 `import_homework` 里、调用 `_classify` 之前单独跑一轮"建档"。
放弃：会导致两次遍历 rows、两套"谁是未知邮箱"的判断逻辑，容易在 dry_run
分支处理不一致。

**2. `enrolled_at` 取该课程场次最早日期，用一条聚合查询，在 `_classify` 里
按需查（只在存在未知邮箱时才查一次）。**

```python
earliest = session.exec(
    select(func.min(CourseSession.local_date)).where(
        CourseSession.course_id == course.id
    )
).one()
enrolled_at = earliest or date.today()
```

只有当这份文件确实包含未知邮箱时才执行这条查询——多数导入（重复导入、老学员
补交）不会触发它，不给"数据库往返次数受约束"这条既有纪律（见 `homework` spec）
增加常态开销。

**3. 姓名占位与字段默认值直接写成模块级常量，不做配置项。**

```python
_AUTO_CREATE_DEFAULTS = {"region": "美东", "level": "有基础", "source": "讲武堂"}
_UNKNOWN_NAME_PLACEHOLDER = "待定"
```

放在 `homework.py` 顶部，与文件里已有的 `MAX_UPLOAD_BYTES`、`_LENIENCY` 等
模块级常量同一位置、同一命名风格。

**4. dry_run 下"会自动建哪些人"直接复用 `未知邮箱集合`，不实例化 `Student`/
`Enrollment` 对象。**

`_classify` 现有的 dry_run 分支已经在"要不要 `session.add`"这一步短路；
自动建档的 `auto_created` 列表本身就是"未知邮箱集合"，dry_run 与非 dry_run
下这份清单的计算方式完全相同，只是后者额外真正建了对象。不需要为 dry_run
单独分支。

**5. 返回体字段改名而非新增字段共存。**

`skipped_no_student` 直接改名为 `auto_created`，不保留旧字段名做过渡。
理由：这是内部工具（讲师自用），唯一已知调用方是本仓库的 `ImportDialog.tsx`
与将来的 MCP（尚未接入），没有需要兼容的外部客户端；保留双字段只会让两者
语义漂移、增加维护负担。`HomeworkImportResult` schema、`ImportDialog.tsx`、
`types.ts`、`actions.ts`、对应测试一并改。

## Risks / Trade-offs

- **[风险] 占位默认值被误认成真实数据** → 缓解：`region="美东"`/`level="有基础"`/
  `source="讲武堂"` 这三个值本身就是这门机构当前最常见的真实取值，与"一眼假"的
  哨兵值（如空字符串或 `"UNKNOWN"`）相比，误判为真实数据的概率其实更高。
  这是已知的可接受风险——`auto_created` 清单存在的目的正是让讲师知道"这些人
  需要回头核对"，缓解手段是流程（讲师看清单去核对），不是靠字段本身自证。
- **[风险] 同一次请求内同一未知邮箱出现两次（不应发生，`parse` 已按人去重）**
  → 缓解：不新增处理，`parse()` 的 `chosen` 字典已保证每个邮箱在 `rows` 里
  只出现一次，本变更的输入前提不变。
- **[风险] 建 `Enrollment` 时该学员在这门课已有一条别的来源的报课记录**
  → 不会发生：触发建档的前提是邮箱在 `students` 表里都不存在，而 `enrollments`
  有外键指向 `students.email`，不存在的学员不可能已有报课记录。

## Migration Plan

无数据库 migration。纯应用层改动，部署后立即生效于下一次导入。
无需数据回填或灰度——旧的 `skipped_no_student` 语义没有历史数据需要迁移
（那份清单从不落库，只是每次请求的返回值）。

## Open Questions

（无——两轮 explore 阶段的 Open Questions 已在 propose 阶段随设计决策解决：
`enrolled_at` 回退到导入当天不单独标注字段，占位默认值保持硬编码常量。）
