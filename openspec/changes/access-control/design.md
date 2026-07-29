## Context

`deployment` change 把系统放上公网时有意没做访问控制——当时安全的唯一依据是生产库空着。
实测暴露面：页面 200、`/api/students` 200、`/docs` 200、`/openapi.json` 200。后两者泄露字段名
（`wechat`、`email`、`nick`），等于公开"这里存着什么类型的个人信息"。

本 change 关掉这些，并成为解除"不得导入真实学员数据"护栏的前置条件。

## Goals / Non-Goals

**Goals:**
- 整站 Basic Auth（共享密码）；后端共享 secret header；生产关闭 API 文档
- 认证逻辑无环境分支、配置缺失时 fail-closed
- 补齐 `openspec/config.yaml` 泄露检查对新变量的覆盖

**Non-Goals:**
- 每人一身份、限流、登出、解除数据护栏、区分认证失败与休眠的错误文案

## Decisions

**1. 前端用 `proxy.ts` 而不是 `middleware.ts`。**（apply 前查阅 Next.js 16.2 文档确认）

本项目的 Next.js 已把 `middleware` 文件约定**弃用并改名为 `proxy`**：文件放项目根目录（与 `app/` 同级），
导出名为 `proxy` 的函数或默认导出。沿用记忆里的 `middleware.ts` 会得到一个**根本不会被执行的文件**——
而失败方式恰恰是"页面照常打开"，与"认证生效但放行"外观完全一致，极难察觉。这正是 requirements 里
fail-closed 那条约束想防的失效形状，只不过成因在文件名。

因此：apply 阶段必须验证 proxy 确实被执行（未带凭据访问得到 401），而不是看到页面能打开就以为配好了。

**2. matcher 用负向匹配排除静态资源，且必须显式配置。**

文档明确：**不配 `matcher` 时 proxy 跑在每个请求上**，包括 `_next/static`、`_next/image`、`public/` 资源，
"otherwise auth logic or redirects can unintentionally block CSS, JS, or images from loading"。

按 requirements 的取舍（静态资源排除），采用文档给的负向模式：
```
'/((?!_next/static|_next/image|favicon.ico).*)'
```
泄露的是前端 bundle 的代码结构，不含学员数据；且 Basic Auth 通过后浏览器对同源请求都会带凭据，
实际差别很小。

**3. fail-closed 的写法必须"先判缺失，再比对"。**

易错写法：
```ts
if (password && provided !== password) deny()   // 变量未设时放行所有人
```
正确形状是两步独立判断：**变量缺失 → 直接拒绝**；变量存在 → 比对，不符 → 拒绝。
两者不可合并成一个条件表达式——合并正是上面那个 bug 的成因。

这条要用测试锁死方向（"缺变量时被拒"是一条独立的 RED），因为它的错误版本在人工点击时**表现完全正常**：
你设了密码、你输对了、页面打开了，一切看起来都对——直到某天变量没配上去。

**4. 后端的 secret 校验放在 FastAPI middleware，不是 router 依赖。**

requirements 要求"默认覆盖所有路由，需放行的显式列出"。router 级依赖是加法（新增 router 容易忘加），
middleware 是减法（新增路由自动受保护）。与前端"默认全拦"同一原则。

比对用 `secrets.compare_digest` 而非 `==`：常数时间比较在 Python 里是标准库自带、零成本，没有不用的理由。
（前端 Edge runtime 无对应内置，且公网上的网络抖动远大于字符串比较的时间差，不额外实现。）

**5. API 文档的开关做成"默认关、显式开"，而不是"生产则关"。**

requirements 说"生产关闭、本地保留"。实现上有两种写法，安全性差别很大：

- `if (环境 == 生产) 关闭` —— 环境判断失误 → 文档在生产泄露
- `if (显式设了开关) 开启` —— 变量没配 → 文档关闭 ✓

选后者：本地 `.env` 里设 `ENABLE_API_DOCS=true`，生产不设。**默认方向是安全的那一侧**，
与决策 3 的 fail-closed 是同一思路。注意这不违反 requirements"认证无环境分支"的约束——
那条约束针对的是认证逻辑本身，文档开关是另一件事，且此处正是用 fail-closed 的方式规避了环境判断。

**6. 前端密码与后端 secret 用两个不同的环境变量，且后端 secret 绝不带 `NEXT_PUBLIC_` 前缀。**

沿用 `BACKEND_URL` 的既有纪律。`openspec/config.yaml` 现有的泄露检查
（`NEXT_PUBLIC_(DATABASE|SUPABASE|SMTP)`）**覆盖不到新变量名**，本 change 要扩充它——
否则哪天有人写成 `NEXT_PUBLIC_BACKEND_SECRET` 打进客户端 bundle，现有检查一声不吭。

**7. 401 响应需带 `WWW-Authenticate: Basic realm="..."`。**

没有这个头，浏览器不会弹出凭据输入框，用户只会看到一个空白的 401——等于登不进去。

## Risks / Trade-offs

- **[`proxy.ts` 命名错误导致认证完全不生效]** → 决策 1。失败形状是"页面照常打开"，与正常状态无法区分。
  缓解：apply 阶段必须实测未授权访问返回 401，不得以"能打开"作为配置成功的判据
- **[fail-closed 写反]** → 决策 3 的独立 RED 测试。这类 bug 人工点击测不出来
- **[matcher 配错拦掉静态资源]** → 页面样式全丢，症状明显、当场可见，风险可控
- **[无限流，密码可被无限尝试]** → requirements 明确接受。安全性依赖密码长度这一前提
- **[secret 配错时错误文案误导]** → requirements 已记为"已知代价"：`error.tsx` 会说"服务器可能正在唤醒"，
  而真因是密钥错。接受，因为它在部署时立刻撞上
- **[生产库为空使"不泄露数据"难以验证]** → 生产环境没有数据可泄露，该断言在生产上恒真、无意义。
  真正有效的验证必须在**本地带 seed 数据**的情况下做：未授权请求的响应体里不得出现任何种子学员信息

## Migration Plan

1. 代码合入（proxy、后端 middleware、docs 开关、`.env.example`、config 检查）
2. **先配平台环境变量，再让代码生效**——顺序反了会把自己锁在外面或留出裸奔窗口：
   - Vercel：前端共享密码变量
   - Render：后端 secret 变量
3. 部署后立即验证：未授权 401、授权后正常、后端直连 401、`/docs` 404
4. 本地 `.env` 补上对应变量（本地与生产行为一致，不配就进不去）

**回滚：** 平台上删掉环境变量**不能**作为回滚手段——fail-closed 意味着删了变量会变成谁都进不去。
真要回滚需回滚代码部署（Vercel / Render 控制台都保留历史版本）。

## Open Questions

无阻塞项。以下两条在 apply 阶段以实测为准：
- Render 的健康检查在后端对未授权请求返回 401 时是否仍判服务健康（401 是正常响应，理应算"服务在跑"）
- 移动端浏览器保存 Basic Auth 凭据后的实际体验
