## ADDED Requirements

### Requirement: 未授权请求不得触达任何页面
系统 SHALL 对未携带有效凭据的请求拒绝访问**全部**页面路由，并且响应体 SHALL NOT 含有任何学员数据。
拒绝必须发生在渲染之前——不得先渲染页面再跳转，那样数据已经出现在 HTML 里。

#### Scenario: 无凭据访问学员名单页
- **WHEN** 未携带凭据的请求访问 `/students`
- **THEN** 返回 401，响应体中不出现任何学员姓名、邮箱或微信号

#### Scenario: 无凭据访问其它页面
- **WHEN** 未携带凭据的请求访问 `/` 或 `/style-guide`
- **THEN** 同样返回 401（保护范围是整站，不是仅含数据的页面）

#### Scenario: 携带正确凭据
- **WHEN** 请求携带正确的共享密码凭据访问 `/students`
- **THEN** 页面照常渲染，行为与引入访问控制之前一致

### Requirement: 后端只接受来自自家前端的调用
后端 SHALL 校验共享 secret header，默认覆盖所有路由；未携带或携带错误 secret 的请求 SHALL 被拒绝。
该 secret SHALL 仅存在于服务端，不得以任何形式出现在浏览器可见的内容中。

#### Scenario: 直接访问后端而不带 secret
- **WHEN** 任何人直接向后端 `GET /api/students` 发起请求，未携带 secret header
- **THEN** 返回 401，不返回学员数据

#### Scenario: 携带错误的 secret
- **WHEN** 请求携带的 secret header 值与配置不符
- **THEN** 返回 401

#### Scenario: 前端服务端调用携带 secret
- **WHEN** Next.js 的 server-side fetch 携带正确 secret 调用后端
- **THEN** 后端正常返回数据

### Requirement: 生产环境不暴露 API 自动文档
后端在生产环境 SHALL NOT 提供 `/docs` 与 `/openapi.json`。
这两个端点即便在 secret 校验之下无法被调用，仍会泄露字段名，等于公开"系统存了哪些类型的个人信息"。

#### Scenario: 持有 secret 的调用方也拿不到文档
- **WHEN** 在生产环境以**正确的 secret** 访问 `/docs` 或 `/openapi.json`
- **THEN** 返回 404 —— 证明这两个路由确实不存在，而非仅被认证遮蔽

#### Scenario: 外部调用方拿不到文档
- **WHEN** 在生产环境未携带 secret 访问 `/docs` 或 `/openapi.json`
- **THEN** 不返回 200（实际为 401：secret 校验在路由之前发生）

### Requirement: 配置缺失时 fail-closed
当认证所需的环境变量缺失时，系统 SHALL 拒绝全部请求，SHALL NOT 放行。
易错写法 `if (password && provided !== password) deny()` 在变量未设时会放行所有人——
这类失效没有任何外部征兆（页面照常打开），必须由测试锁死方向。

#### Scenario: 前端密码变量缺失
- **WHEN** 前端的共享密码环境变量未设置，收到任意请求
- **THEN** 请求被拒绝（而非放行）

#### Scenario: 后端 secret 变量缺失
- **WHEN** 后端的 secret 环境变量未设置，收到任意请求
- **THEN** 请求被拒绝（而非放行）

### Requirement: 认证行为不随环境变化
认证逻辑 SHALL NOT 包含任何环境判断分支（如 `NODE_ENV === 'development'`）。
本地开发与生产运行同一条代码路径，以消除"环境变量配错导致认证静默关闭"这一失效模式。

#### Scenario: 本地开发同样需要凭据
- **WHEN** 在本地开发环境访问受保护页面，未携带凭据
- **THEN** 行为与生产一致——同样被拒绝
