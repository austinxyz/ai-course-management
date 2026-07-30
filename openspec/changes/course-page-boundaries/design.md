## Context

六个页面各自渲染 `<Sidebar active={...} />`：`app/students/page.tsx`、`app/courses/page.tsx`
与四个占位页。`loading.tsx` / `error.tsx` 只有学员页有，且因为落在 page 这一层，
渲染时会把整屏（含侧边栏）一起替掉。

生产实测（Vercel，后端已唤醒）从课程页点「学员」：

```
0–250ms    旧的课程页原地不动，高亮还停在「课程」
~250–600   整屏加载卡片，侧边栏消失
~600ms     学员页出现，高亮这时才跳
```

反方向更糟：`/courses` 没有 `loading.tsx`，Next 保持旧页面直到 RSC 到达 —— 646ms 静止，
冷启动时几十秒。

本版 Next 是 **16.2.12**（`frontend/AGENTS.md` 明确要求先读 `node_modules/next/dist/docs/`
再写；下面每条决策都注明了依据的文档位置）。

## Goals / Non-Goals

**Goals:**

- 页面切换期间侧边栏保持可见，加载/错误只换内容区
- 高亮在导航提交时移动，不等数据
- 课程页补齐加载态与错误态
- 路由组之外有中文错误兜底

**Non-Goals:**

- 预取 / `staleTimes` 调优（治的是"等待时长"，不是"等待反馈"）
- 骨架屏、顶部进度条
- `global-error.tsx`
- 任何后端改动

## Decisions

### 1. 路由组 `(app)/` 承载外壳，而不是把 Sidebar 做成客户端 Provider

把 `Sidebar` 提到 `app/(app)/layout.tsx`。路由组不产生 URL 段，所以
`/students`、`/courses`、`/enroll` 等路径**全部不变** —— 这是选它而非真实目录段
（如 `app/admin/...`）的原因：真实段会改 URL，牵连 `proxy.ts` 的匹配、
`revalidatePath` 的字符串、以及任何写死的链接。

**替代方案**（未采用）：保持每页各自渲染 Sidebar，用客户端 Provider 共享状态。
这解决不了根本问题 —— `loading.tsx` / `error.tsx` 的替换范围由**文件位置**决定，
与状态无关。侧边栏要活下来，它必须在边界之上，也就是必须在 layout 里。

四个占位页一并迁入：它们现在也各自渲染 Sidebar，不迁的话以后转正还要再搬一次。

### 2. layout 的取数必须包 `<Suspense>` —— 这是本版行为，不是风格

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md:90-95`：

> If the layout accesses uncached or runtime data …, `loading.js` will not show a fallback for it.
> **Without Cache Components: Navigation blocks until the layout finishes rendering.**
> To ensure instant navigation, move uncached data fetching from `layout.js` into `page.js`,
> or wrap the runtime data access in your layout in its own `<Suspense>` boundary.

徽标计数是 layout 唯一的取数。**不包 Suspense，每一次导航都会被它阻塞** ——
比现状更糟：现在至少只有"进入某页"慢。

实现形状：layout 同步渲染 `<Sidebar>` 外壳，计数作为一个 async 子组件放进
`<Suspense fallback={<无计数的徽标 />}>`。fallback 就是现有的 `—`
（Sidebar 的 `studentCount` 省略时的既有渲染），所以"计数没到"与"这页不数"
在视觉上是同一个占位 —— 二者语义本就相同：**没数过的位置不能声称是 0**。

**替代方案**（未采用）：把计数留在 `/students` page 里用 client context 往上送。
需要额外机制，且别的页面就永远显示 `—` —— 而讲师在课程页也想看到学员总数。

### 3. 高亮用 `usePathname`，`loading.tsx` 是它即时生效的前提

`active` 从 prop 改为 `usePathname()` 派生。要点：**`usePathname` 在导航提交时更新，
不在点击瞬间**。之所以够用，正是因为本 change 同时给 `/courses` 补了 `loading.tsx` ——
有 loading 边界时 Next 立即提交导航并渲染 fallback。同一份文档反过来印证了这点：
`use-link-status.md` 说 `useLinkStatus` 适用于"目标路由是动态的**且**没有 `loading.js`"的场合。

所以「补 loading」与「高亮即时」不是两件事，是一件事的两面。

**兜底**（先实测再决定，不预先加）：若预取被禁或进行中导致高亮仍滞后，
用 `next/link` 导出的 `useLinkStatus()` 的 `pending` 补一个待定态。

Sidebar 因此成为客户端组件（`usePathname` 是客户端 hook）。它本来就只有链接与文本，
没有服务端依赖；计数由 layout 以 prop 传入，不在 Sidebar 内取数。

### 4. `revalidatePath` 改 layout 粒度，路径写法按路由组实测确认

`revalidatePath.md:160-166`：`'page'` 只失效该 page 文件匹配的路径；`'layout'` 才会
连带其下的页面。徽标进 layout 之后，`revalidatePath("/students")`（默认 page 粒度）
**不会**刷新徽标。

同一份文档给的带路由组示例是 `revalidatePath('/(main)/post/[slug]', 'layout')` ——
所以搬进 `(app)` 之后可能要写成 `/(app)/students`。**这条在 apply 时用真实写入实测确认**：
写错的症状是"加完学员徽标不动"，与"根本没改粒度"外观完全一致，靠读代码分不出来。

### 5. 两层 error 边界，分工由文档定死

`error.md:96`：

> `error.js` wraps `loading.js`, `not-found.js`, `page.js`, and nested `layout.js` files in a React
> error boundary. It does **not** wrap the `layout.js` or `template.js` above it in the same segment.

于是：

| 文件 | 接住什么 | 侧边栏 |
|---|---|---|
| `app/(app)/error.tsx` | 组内各页面的渲染错误 | **在**（渲染于 `(app)/layout.tsx` 之内） |
| `app/error.tsx` | `(app)/layout.tsx` 自身抛的错、组外页面（`/`、`/style-guide`） | 不在 |

根 layout 自身抛错需要 `global-error.tsx` —— 不做（根 layout 只加载字体与全局样式，
不取数据），记为已知缺口。

### 6. `loading.tsx` 按路由各放一份，`error.tsx` 共用一份

加载态文案分页面（"正在加载学员数据…" / "…课程数据…"）—— 共享 layout 已经解决了闪烁，
没有理由再牺牲文案。

错误态相反，共用 `(app)/error.tsx` 一份：现有文案"服务器可能正在唤醒……也可能是网络或服务异常"
本就没有提到学员，对任何数据页都成立。两份近乎相同的错误卡片是重复，不是精确。

### 7. 现有 `students/loading.tsx`、`students/error.tsx` 用 `git mv` 迁移

保住 blame。二者的 DOM 内容不变，只改最外层容器：`min-h-screen` 整屏居中
→ 在内容区内居中。它们的既有测试（`loading.test.tsx`、`error.test.tsx`）跟着移动，
断言的是文案与重试行为，不依赖容器 —— 预计不受影响；若有断言绑定了整屏容器，一并改。

## Risks / Trade-offs

- **[路由组会让所有既有前端测试的导入路径失效]** → 测试文件与被测文件一起 `git mv`，
  相对导入不变；绝对导入（`@/app/students/...`）需要逐一改。先跑一遍全量测试定位，
  不靠肉眼找
- **[`revalidatePath` 路径写错，症状与没改一模一样]** → 必须用**真实新增学员**的端到端
  路径验证徽标变化，不能只看代码或只看单测
- **[layout 与 page 可能重复请求学员名单]** → 二者取的是同一个 GET，Next 的
  request memoization 理应在同一次渲染内合并。**实测确认，不假设**；若没合并，
  接受两次请求（内部工具、个位数用户），不为此加计数专用端点，但要在验收里记下实际结果
- **[Suspense 漏包，症状是"哪儿都变慢"而不是报错]** → 这是本 change 最隐蔽的失败模式：
  没有任何错误信息，只是每次导航都等。用"后端不可达时占位页仍能打开"这条断言把它钉住 ——
  漏包时这条必然失败
- **[高亮实测仍滞后]** → `useLinkStatus` 兜底方案已备好（决策 3），但先实测

## Migration Plan

**无 schema 变更，无数据迁移，不碰后端。** 纯前端目录重组，前端单独部署即可。

回滚 = revert 提交。路由组不改 URL，所以回滚不会留下坏链接。

## Open Questions

（无阻塞项。以下为已定边界：）

- 占位页一并迁入路由组
- 徽标计数由 layout 取，fallback 用既有的 `—`
- `error.tsx` 共用一份，`loading.tsx` 各一份
- 不做 `global-error.tsx`

**留给 apply 阶段实测、不得默认成立的两点**：`revalidatePath` 的路径写法；
layout 与 page 是否重复请求。
