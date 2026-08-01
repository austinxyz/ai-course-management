## ADDED Requirements

### Requirement: 作业导入为未知学员倒推一条报课记录

作业成绩导入遇到不在学员表的邮箱时，SHALL 为其自动创建一条报课记录，`source`
SHALL 为 `"derived"`，`course_id` SHALL 为本次导入的目标课程，`session_id`
SHALL 为空（未定场次）。

该报课记录的 `enrolled_at` SHALL 取该课程所有场次中最早的 `local_date`；
该课程尚未创建任何场次时，SHALL 回退为本次导入发生的日期。

理由：这是 `derived` 这个来源取值第一个具体的自动触发场景——此前该取值只在
学员详情的报课记录展示上被定义为"可被平台数据覆盖的倒推占位"，本次导入是
第一处实际写入 `derived` 记录的路径。`enrolled_at` 用最早场次日期而不是导入当天，
是因为对于开课已久、后段才补交作业的学员，导入当天与实际报名时间可能相差很远，
课程最早场次日期是比"今天"更接近事实的近似。

#### Scenario: 目标课程已有场次
- **WHEN** 某未知邮箱的作业被导入到某门已排了三场课的课程
- **THEN** 系统为该邮箱创建一条 `source="derived"` 的报课记录，`enrolled_at`
  等于这三场中最早的 `local_date`，`session_id` 为空

#### Scenario: 目标课程尚无任何场次
- **WHEN** 某未知邮箱的作业被导入到一门尚未创建任何场次的课程
- **THEN** 系统创建的报课记录 `enrolled_at` 为导入发生当天的日期
