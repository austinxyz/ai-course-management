## ADDED Requirements

### Requirement: 学员列表查询
系统 SHALL 通过 `GET /api/students` 返回全部学员记录，字段覆盖姓名、邮箱、微信号、微信昵称、区域、基础、来源、标签、备注。

#### Scenario: 正常返回一批学员
- **WHEN** 客户端调用 `GET /api/students`，且库中有学员记录
- **THEN** 返回 200，body 是学员数组，每条记录包含姓名/邮箱/微信号/微信昵称/区域/基础/来源/标签/备注全部字段

#### Scenario: 空库返回空数组，不是报错
- **WHEN** 客户端调用 `GET /api/students`，且库中没有任何学员记录
- **THEN** 返回 200，body 是空数组 `[]`（不是 404/500），前端据此渲染"暂无学员"

### Requirement: 按邮箱查单个学员
系统 SHALL 通过 `GET /api/students/{email}` 返回该邮箱对应的学员完整记录；邮箱不存在时 SHALL 返回 404。

#### Scenario: 邮箱存在，返回该学员
- **WHEN** 客户端调用 `GET /api/students/{email}`，`email` 在库中存在（匹配不区分大小写）
- **THEN** 返回 200，body 是该学员的完整字段

#### Scenario: 邮箱不存在
- **WHEN** 客户端调用 `GET /api/students/{email}`，`email` 在库中不存在
- **THEN** 返回 404

### Requirement: 邮箱唯一性
学员表的邮箱列 SHALL 有唯一约束；系统 SHALL 拒绝重复邮箱的写入（约束在 schema 层生效，即便本 change 未开放写接口）。

#### Scenario: 重复邮箱写入被数据库拒绝
- **WHEN** 测试直接向学员表插入一条邮箱与已有记录相同的新行
- **THEN** 数据库因唯一约束拒绝该次插入，表中该邮箱始终只有一条记录

### Requirement: 微信号可为空
系统 SHALL 允许微信号字段为空；未采集微信号的学员，API SHALL 返回空字符串 `""`（不是 `null`，不是省略该字段）。

#### Scenario: 微信号为空的学员正常返回
- **WHEN** 客户端查询到微信号字段未采集的学员
- **THEN** 返回记录中 `wechat` 字段为空字符串 `""`，前端据此判定该学员"未对齐微信"
