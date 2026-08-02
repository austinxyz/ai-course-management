## Context

`homework` spec 目前禁止显示各分项满分，理由是满分不在 `grades.csv` 里。本变更加一张
应用内维护的评分表，给满分一个可信来源，并在作业详情面板、名单表格、课程页三处
消费它。`GET /api/homework` 现有一条硬约束——**必须在一次数据库往返内取全所需数据**
（`homework` spec 的既有 Requirement），新加的满分数据不能破坏这条。

## Goals / Non-Goals

**Goals:**
- 满分数据独立于 `homework_submissions.scores`（那是 jsonb 数组，只存 item+score，
  不重复存 max——满分是课程级配置，不该跟着每条提交重复），改动满分不需要重写
  历史提交
- `GET /api/homework` 保持单次往返
- 课程页维护表单的"分项名自动列出"来自实际数据，不需要新查询专门服务这件事——
  复用现有导入产生的 `homework_submissions.scores`

**Non-Goals:**
- 不做满分变更的审计留痕
- 不做跨课程共享评分表（每门课独立一份，即使分项名字面相同）

## Decisions

**1. 新表 `homework_rubric_items`，主键 `(course_id, item)`。**

```sql
CREATE TABLE homework_rubric_items (
  course_id uuid NOT NULL REFERENCES courses(id),
  item text NOT NULL,
  max_score integer NOT NULL CHECK (max_score > 0),
  PRIMARY KEY (course_id, item)
);
```

`max_score` 用 `CHECK (max_score > 0)` 在 schema 层直接挡住 0 和负数——不满足"满分必须
是正整数"这条 spec 要求的输入，数据库层面就拒绝，不依赖应用层校验独扛。"未配置"用
**这一行不存在**表达，不用可空列 + 一个哨兵值——少一种"到底是没配还是配了个空值"的
歧义。

**2. `GET /api/homework` 用一条**标量子查询**把该课程的满分表聚合成 jsonb，嵌进主查询，
不新增一次往返。**

```python
rubric_json = (
    select(func.jsonb_object_agg(HomeworkRubricItem.item, HomeworkRubricItem.max_score))
    .where(HomeworkRubricItem.course_id == course)
    .scalar_subquery()
)
rows = session.exec(
    select(Enrollment, Student, CourseSession, HomeworkSubmission, rubric_json)
    .join(...)
).all()
```

这仍然是**一条 SQL 语句、一次网络往返**——子查询是这条语句的一部分，不是应用层
发出的第二次 `session.exec`。既有约束（`GET /api/homework` 的往返次数）是按"应用发出
几次数据库调用"钉的，不是按"这条 SQL 内部有几个 SELECT 关键字"。

备选：单独一次 `session.exec` 查满分表，Python 端合并。放弃：这是新增的第二次往返，
直接违反既有 Requirement。备选二：把满分 JOIN 进主查询按 item 展开成多行。放弃：
`scores` 是 jsonb 数组，SQL 层面对它按元素 JOIN 需要 `jsonb_array_elements` 展开整条
主查询的行结构，会把"一个学员一行"变成"一个学员每个分项一行"，下游按学员分组
的代码全要重写，复杂度不值这个功能的重量。

**3. "总分要不要显示进度条"按**这条提交自己的分项集合**判定，不做跨提交/跨课程的
完整性校验。**

spec 写的是"这门课当前用到的全部分项都配了满分"，实践中同一门课所有学员的分项集合
是同一套（导入时整份文件共用一个表头），所以"这条提交自己的分项是否全配齐"与
"这门课全部分项是否配齐"在正常情况下是同一件事。按提交自己判定不需要额外查询
（用的就是同一条主查询已经取到的 `scores` 与聚合出的满分 map），比"先查一遍这门课
所有历史出现过的分项名"简单得多，且不违反单次往返的约束。

**4. `PUT /api/homework/rubric` 整表覆盖式写入，请求体是这门课**当前全部分项名**各自
的满分（可为 `null` 表示不配置）。**

讲师在课程页的表单本来就会把所有分项（有的填了数字、有的留空）一次提交上来。
后端收到后：`max_score` 有值的 upsert，`null` 的删除对应行（如果原来存在）。

跟 `homework` 导入的"整份覆盖式写入"是同一套哲学——写入语义是"以这次提交为准"，
不是"只改我传的那几个字段"。

## Risks / Trade-offs

- **[风险] 标量子查询在每一行都重新求值一次（不是只算一次）** → 缓解：这门课的分项数
  是个位数到十几个（S1 是 10 项），聚合一次的开销可忽略；即使 Postgres 没有对这个
  uncorrelated 子查询做缓存优化，代价也远小于一次额外网络往返（61ms）。
- **[风险] "按提交自己的分项集合判定"在同一门课分项名跨批次变化时，不同学员的总分
  进度条显示状态可能不一致（老批次全配齐、新批次少一项）** → 接受：这属于
  Out of Scope 里"同一门课分项名随时间变化"的已知边界，不特殊处理。

## Migration Plan

新增 `homework_rubric_items` 表，无需回填（默认没有任何行 = 所有分项都是"未配置"，
行为与本变更之前完全一致）。部署后立即生效。回滚：`DROP TABLE homework_rubric_items`，
安全——没有其他表引用它。

## Open Questions

（无——explore 阶段的 Open Questions 已在这里定：满分校验用数据库 CHECK 约束
`> 0`，不用可空默认值当哨兵。）
