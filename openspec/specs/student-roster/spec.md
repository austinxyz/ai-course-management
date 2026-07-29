# student-roster Specification

## Purpose
提供学员档案的只读查询能力——按邮箱（全局唯一标识）列出全部学员或查单条记录，供讲师与合作伙伴在学员管理系统里查看名单和详情。这是 Next.js → FastAPI → Supabase 端到端垂直切片的第一条能力，后续报课、作业、催作业等能力都建立在这张学员表之上。

同时约定该能力在**数据源不可达时的降级表现**：这套系统跑在会休眠的免费档后端上，冷启动是常态而非异常，因此"连不上时页面呈现什么"与"查得到时呈现什么"同属这条能力的契约。
## Requirements
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

### Requirement: 后端不可达时的降级
学员名单页 SHALL 在后端不可达时呈现可读的错误说明与重试入口，而非白屏或未捕获的异常。
错误说明 SHALL 同时覆盖"服务正在唤醒"与"服务异常"两种可能——前端无法区分二者，不得断言其一。

#### Scenario: 后端不可达时渲染错误态
- **WHEN** 用户打开学员名单页，而后端不可达（冷启动超时、服务宕机或网络故障）
- **THEN** 页面渲染错误卡片，包含说明文案与"重试"按钮；不出现白屏，也不出现未捕获的异常堆栈

#### Scenario: 点击重试重新获取数据
- **WHEN** 用户在错误态点击"重试"按钮
- **THEN** 前端重新发起该页面的数据获取；若此时后端已可用，则渲染学员名单

### Requirement: 加载态的等待预期管理
学员名单页 SHALL 在数据获取期间呈现加载态，且该加载态 SHALL 明示可能出现的长时间等待，
避免用户将正常的冷启动等待误判为页面卡死而反复刷新。

#### Scenario: 数据获取期间渲染加载态
- **WHEN** 学员名单页的数据获取尚未完成
- **THEN** 页面渲染加载态，其文案包含对等待时长的说明（约 1 分钟量级），而非仅"加载中"三字

### Requirement: 生产连接串兼容性
后端 SHALL 接受 Supabase 控制台格式的数据库连接串（`postgresql://` 前缀）并以 psycopg v3 驱动建立连接，
不得因驱动解析而在启动时崩溃。

#### Scenario: 接受 postgresql 前缀的连接串
- **WHEN** 后端以 `postgresql://` 前缀的 `DATABASE_URL` 启动
- **THEN** 连接使用 psycopg v3 驱动成功建立，不抛出 `ModuleNotFoundError: psycopg2`

#### Scenario: 已带驱动限定的连接串保持不变
- **WHEN** 后端以 `postgresql+psycopg://` 前缀的 `DATABASE_URL` 启动（本地开发的既有写法）
- **THEN** 连接照常建立，行为与归一化之前一致

