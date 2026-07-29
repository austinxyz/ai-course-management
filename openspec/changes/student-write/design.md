## Context

`frontend/app/students/StudentsClient.tsx` 里有三块本地状态承载所有"写"：`over`（字段覆盖）、
`added`（新增的学员）、`archived`（归档邮箱表）。五种写操作全部只改这三块 state，刷新即失。

后端只有两个读端点，表里没有归档字段。前端没有任何从客户端发起写请求的合法通路——
`lib/api.ts` 是 server-only，而架构纪律禁止浏览器直连 FastAPI。

## Goals / Non-Goals

**Goals:**
- 五种写操作落库；归档所需的 schema 变更一并完成
- 写入通路走 Server Actions，符合"浏览器只与 Next.js 通信"
- 写入面独立鉴权，不把整个写入面押在 `proxy.ts` 单点
- 界面能表达"保存中"与"保存失败"，失败时保留用户输入

**Non-Goals:**
- 乐观更新、并发控制、硬删除、改邮箱、审计、批量编辑

## Decisions

**1. 服务端成为唯一真相源，`over` / `added` / `archived` 三块本地状态删除。**

这是本 change 最大的**减法**，容易被忽略。"等服务器确认"意味着写完之后要让页面反映新数据；
Server Action 里调 `revalidatePath('/students')`，Next.js 重跑 Server Component、把新数据作为 props 送下来。
既然如此，客户端就没有理由再维护一份可变副本——保留它反而会产生"本地副本与服务端数据不一致"这一整类 bug。

保留的本地状态只剩**纯 UI 态**：当前选中谁、哪个字段在编辑、编辑框里的临时值、
哪个字段正在保存、哪个字段保存失败。这些本来就不该落库。

*注意*：删除 `over` 会改变 `applyOverride` 的存在意义（它现在负责把覆盖合并进学员对象），
该函数随之移除。

**2. 每个 Server Action 内部重新校验凭据，凭据来源是同一份 Basic Auth。**

Next.js 文档明确警告 Server Functions "reachable via direct POST requests, not just through your
application's UI"。写入面被绕过的后果远重于读——读是泄露，**写是篡改**，而 Action 在服务端、
手里握着 `BACKEND_SECRET`，后端会照单全收。

实现上不造新机制：Server Action 收到的 POST 与页面同源，浏览器会带上已缓存的 Basic Auth 凭据，
Action 内通过 `headers()` 读取 `Authorization` 并复用与 `proxy.ts` 相同的比对逻辑
（比对函数抽出来共用，避免两处实现漂移）。

**⚠️ 这条必须在 apply 阶段实测，且它有双向风险：**
- 若 `proxy.ts` 的 matcher **没有**覆盖 Server Action 的 POST，而 Action 内又没校验 → 写入面裸奔
- 若浏览器**没有**在 Server Action 请求上带 `Authorization` 头 → 校验永远失败 → 所有写操作全挂

第二种是 fail-closed（安全但不可用），第一种是 fail-open（可用但危险）。两种都必须实测排除，
不能靠推断。

**3. 归档用独立端点，时间戳服务端盖。**

`POST /api/students/{email}/archive` 与 `/restore`，不把 `archived_at` 混进字段更新端点。
归档是一个动作而非"改一个字段"；让客户端提交时间戳没有任何收益，却允许它填入任意值。
字段更新端点显式忽略/拒绝归档字段。

**4. `archived_at timestamptz`（null = 在读）而非 boolean。**

多存"何时归档"成本近乎为零，而这信息以后大概率有用（结课/退课时间）。
新增列必须可空且既有行默认 null，否则现有数据无法迁移。

**5. 写请求体用 Pydantic `Literal` 校验枚举；读响应仍然用 `str`。**

兑现 `student-management` 当时的决定。那次把 `Literal` 从**读响应**里拿掉，是因为一行脏数据会让
整个列表接口 500（`ResponseValidationError` 作用于整个响应）。请求体校验没有这个问题——
校验失败只影响这一次写入，正是 `Literal` 该在的位置。

`schemas.py` 里既有的 `Region` / `Level` / `Source` 别名此前无人使用，本 change 启用它们。

**6. 字段更新端点接受部分字段（PATCH 语义）。**

界面是逐字段提交，一次只改一个。端点接受"只含被改字段"的请求体，未出现的字段保持原值。
用 Pydantic 的"未设置"与"显式设为空"区分——**这两者语义不同**：备注被清空是合法操作，
不能与"本次不改备注"混为一谈。

**7. 保存中/失败是 per-field 状态，不是全局状态。**

mock 已定：只让正在保存的那一行进入等待态。因此本地要记录"哪个字段在保存"而非一个布尔量。
文档提到客户端**串行**派发 Server Action，所以不会出现多个字段同时在飞的情况，
但仍需按字段记录，因为失败提示要显示在具体字段旁。

## Risks / Trade-offs

- **[Server Action 的鉴权两难]** → 决策 2。**apply 阶段必须同时验证两个方向**：
  未授权直接 POST 被拒（防裸奔）、正常界面操作能写成功（防全挂）。任一未验证都不算完成
- **[删除本地状态导致既有交互回归]** → 筛选、选中、详情面板、新增弹窗都读这些状态。
  改动面比"加几个写接口"大得多。缓解：删除后需重跑既有的交互验证（筛选、切换在读/已归档、
  选中联动详情），不能只测新增的写功能
- **[`revalidatePath` 与 `no-store` 的交互]** → `/students` 已是 dynamic route（构建输出为 `ƒ`），
  没有路由缓存需要失效；`revalidatePath` 在此的作用是让路由刷新 RSC payload。
  apply 阶段需确认写入后界面确实反映新值，而不是停留在旧 props
- **[部分字段更新的语义歧义]** → 决策 6。"未提供"与"提供空值"必须区分，否则清空备注会变成不生效
- **[生产库为空导致写功能无法在生产验证]** → requirements 已安排：建一条虚构测试记录走完全流程，
  验完**直连数据库**清除（硬删除不是功能，本 change 也不新增）

## Migration Plan

1. 新增 migration：`alter table students add column archived_at timestamptz`（可空，既有行为 null）
2. 本地 `supabase db reset` 验证 migration + seed 组合可用
3. 合入代码；push 后 GitHub Actions 自动把 migration 推到生产
4. 生产验收：建虚构测试记录 → 走完写流程 → 直连数据库清除

**回滚：**
- 代码：Vercel / Render 控制台回滚到上一版部署
- 数据库：Supabase CLI 无 down migration。`archived_at` 是可空新列，
  即便代码回滚，多出来的列不会影响旧版代码（旧版 SELECT 不含该列）——因此**无需回滚 schema**
- 本 change 不改动既有列，无数据丢失风险

## Open Questions

无阻塞项。apply 阶段以实测为准的两条已在 Risks 中列明（Server Action 鉴权的双向验证、
`revalidatePath` 后界面确实刷新）。
