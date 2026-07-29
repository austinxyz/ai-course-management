## ADDED Requirements

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
