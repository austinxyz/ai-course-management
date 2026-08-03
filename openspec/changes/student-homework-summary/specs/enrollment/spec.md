## ADDED Requirements

### Requirement: 报课记录附带该课程的作业情况概要

`GET /api/enrollments` 的每一条记录 SHALL 附带该学员在这门课的作业提交总分（`homework_total`），没有提交记录时该字段 SHALL 为 `null`。该字段 SHALL 在既有的一条 JOIN 语句里取得，SHALL NOT 增加应用层的数据库往返次数。

同一学员对同一门课有多条报课记录时，各条记录的 `homework_total` SHALL 相同——作业成绩挂在「学员+课程」上，不挂在某一条具体的报课记录上，与「作业按人计，不按报课记录计」的既有规则一致。

理由：讲师在学员详情页翻报课记录时，常想知道"这门课他交了没、大概多少分"，不应该逼他切到 `/homework` 页按课程翻名单去找人。

#### Scenario: 有提交记录时带出总分
- **WHEN** 某条报课对应的学员在这门课已有作业提交
- **THEN** 该条 `GET /api/enrollments` 记录的 `homework_total` 是那条提交的总分

#### Scenario: 没有提交记录时为 null
- **WHEN** 某条报课对应的学员在这门课还没有作业提交
- **THEN** 该条记录的 `homework_total` 是 `null`

#### Scenario: 重复报名的两条记录总分一致
- **WHEN** 某学员对同一门课有两条报课记录（重复报名），且这门课已有一条作业提交
- **THEN** 两条报课记录的 `homework_total` 都等于那条提交的总分

#### Scenario: 不增加数据库往返
- **WHEN** 前端请求某学员的报课列表
- **THEN** 后端处理这次请求执行的 SQL 语句数量与新增字段之前相同
