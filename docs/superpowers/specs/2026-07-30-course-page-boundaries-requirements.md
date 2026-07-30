---
Date: 2026-07-30
Change: course-page-boundaries
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# course-page-boundaries Requirements

来源：讲师报「切换左侧 tab（学员 / 课程），感觉刷新有点问题」。

## 为什么

生产实测（Vercel，后端已唤醒），从课程页点「学员」：

```
0–250ms    旧的课程页原地不动，tab 高亮还停在「课程」   ← 点了没反馈
~250–600   整屏加载卡片，侧边栏一起消失                 ← 看着像整页刷新
~600ms     学员页出现，高亮这时才跳过去
```

反方向（学员 → 课程）更糟：`/courses` 连 `loading.tsx` 都没有，Next 会**保持旧页面
原地不动**直到新页面的 RSC 到达。后端已唤醒时是 646ms 的静止，Render 免费档冷启动时
是几十秒的"点了没反应"。

导航本身是好的 —— 抓包确认是软导航（一次 `_rsc=` 请求，无整页文档请求）。问题全在反馈。

三个症状同源：**`Sidebar` 由每个 page 各自渲染，不在共享 layout 里**。于是

1. `loading.tsx` / `error.tsx` 落在 page 这一层 —— 它们一渲染就替掉整屏，把侧边栏一起带走；
2. `active` 是服务端传进来的 prop —— 高亮只能等新页面渲染完才动；
3. `/courses` 两个边界都没有，`app/` 根也没有 —— `/students` 之外任何地方出错，
   掉的是 Next 的默认错误页（英文、无重试）。

`/courses` 缺文件只是表层。`student-roster` 的 spec 里有「加载态的等待预期管理」与
「错误态重试」两条需求，`course-catalog` 没有同款 —— 这是能力洞，不是视觉调整。

## Goals

- 切 tab 时**侧边栏不消失**，只有内容区换 —— 软导航看起来就该像软导航
- 点击后**高亮立即响应**，不等数据回来
- `/courses` 与 `/students` 一样有加载态与错误态；加载态文案说明可能的长等待，
  错误态提供**能真正重新取数**的重试
- 路由组之外也有中文错误兜底

## Non-Goals

- **不做骨架屏**（把表格/卡片的形状先画出来那种）—— 现有那张"正在加载…（约 1 分钟）"
  卡片的文案价值高于形状仿真，冷启动场景下尤其
- **不改导航结构**，不加页面，不动 `NAV` 词表
- **不做进度条 / 顶部 loading bar**
- **不碰后端**，不改任何 API
- **不做预取调优**（`prefetch` 策略、`staleTimes` 配置）—— 先把反馈做对，
  再谈把等待变短。二者混在一起会分不清是哪一项起的作用
- **不做 `global-error.tsx`** —— 它只在**根 layout 自身**抛错时才用得上，而本项目的根 layout
  只加载字体与全局样式，不取数据。根 `app/error.tsx` 管不到那一层（文档：error.js
  「does not wrap the layout.js ... above it in the same segment」），这是已知且接受的缺口

## Constraints

- 架构纪律不变：浏览器只与 Next.js 通信，数据仍由 Server Component 取
- **Sidebar 提到共享 layout**：新建路由组 `app/(app)/`，含 students、courses
  与四个占位页（报课/作业/催作业/互动记录）。占位页现在也各自渲染 Sidebar，
  一并收编，否则以后转正时还要再搬一次
- **layout 取数必须包 `<Suspense>`**，否则**每一次导航都会被它阻塞**。这不是为占位页
  开的方便，是本版 Next 的硬性行为，文档原文（`node_modules/next/dist/docs/01-app/
  03-api-reference/03-file-conventions/loading.md:90-95`）：layout 访问未缓存/运行时数据时
  `loading.js` **不会**为它显示 fallback，且「Without Cache Components: Navigation blocks
  until the layout finishes rendering」。解法文档也点名了：把取数移进 page，或**在 layout 里
  用独立的 `<Suspense>` 包住**。徽标计数取后者。
  由此顺带保住占位页的现有性质：它们不取数据，后端睡着时照常打开
- **`revalidatePath` 粒度与路径写法都要跟着改**：徽标进 layout 后，
  `revalidatePath("/students")` 是 page 粒度，**不会**刷新 layout。要改成 layout 粒度。
  另注意**路由组会改变路径写法** —— 文档给的带组示例是 `revalidatePath('/(main)/post/[slug]', 'layout')`，
  所以 `/students` 搬进 `(app)` 之后可能要写成 `/(app)/students`。这条在 apply 时实测确认，
  写错的症状是"加完学员徽标不动"，与"根本没改粒度"**外观完全一致**
- **高亮由 `usePathname` 派生**，不作为 state 持有。但要清楚它的时机：
  `usePathname` 在**导航提交时**更新，不在点击瞬间。之所以够用，正是因为本 change 给
  `/courses` 补了 `loading.tsx` —— 有 loading 边界时 Next 立即提交导航并渲染 fallback。
  两件事是同一件事的两面，不是两个独立改动。
  兜底：若实测高亮仍滞后（预取被禁或进行中），用 `useLinkStatus()` 的 `pending` 补一个待定态
  （`next/link` 导出，见 `use-link-status.md`）——**先实测再决定**，不预先加
- `loading.tsx` **仍按路由各放一份**（学员/课程各自的文案），不合并成一份通用的 ——
  共享 layout 已经解决了闪烁，没有理由再牺牲文案
- 本版 Next 的 API 与训练数据可能不同（见 `frontend/AGENTS.md`）：
  路由组、`<Suspense>`、`revalidatePath` 的第二参数、`unstable_retry` 都要
  **先读 `node_modules/next/dist/docs/`** 再写

## Success Criteria

1. 从课程页点「学员」，**侧边栏在整个过程中不消失**（导航中任一时刻 `aside` 都在）
2. 点击后侧边栏高亮在**导航提交时**移到目标项，不等数据返回。有 `loading.tsx` 时
   提交是即时的，所以观感上就是"点了就亮"
3. `/courses` 在数据未到达时渲染加载态，文案含长等待说明（约 1 分钟量级），
   而非仅"加载中"
4. `/courses` 取数失败时渲染错误态，重试按钮**重新取数**（`unstable_retry`，
   不是 `reset` —— `reset` 只重渲染子树，点了会原地不动停在错误页）
5. 占位页（如 `/enroll`）在**后端不可用时仍能打开**并显示占位内容
6. 新增学员后，侧边栏徽标数字**随即更新**
7. 路由组之外的错误（如 `/style-guide`）落到中文错误页而非 Next 默认页
8. 前端测试套件无回归；`npm run build` 通过

**生产验收**：

9. 生产上两个方向切 tab，侧边栏都不闪；高亮即时
10. 生产上直接访问 `/courses`（后端休眠时）看到加载卡片而非空白或平台 504

## User Stories

- 作为讲师，我点「课程」时希望马上知道**点到了** —— 现在点完屏幕纹丝不动，
  我会以为没点上而再点一次
- 作为讲师，切 tab 时侧边栏整块消失又出现，看着像整页刷新；我希望它就待在那儿
- 作为讲师，课程页取数失败时我希望看到能重试的中文提示，而不是英文报错页

## Open Questions

（无阻塞项。以下为 2026-07-30 人工确认的边界：）

- **Sidebar 提到共享 layout**（而非只给 `/courses` 补两个文件）—— 后者改动更小，
  但"整屏闪 + 高亮延迟"两条会留着，且每加一个数据页都要再抄一遍
- **徽标由 layout 取数**，写操作改 layout 粒度 revalidate。备选是"只有学员页有数、
  别处显示 `—`"（现状语义），需要一套 client 注入机制，不值
- **四个占位页一并收编**进路由组，靠 `<Suspense>` 保证不被 layout 取数阻塞
- **根 `app/error.tsx` 一并加**（选项 2），不只在路由组内放一个。
  两者分工由文档定死：`(app)/error.tsx` 渲染在 `(app)/layout.tsx` **之内**（侧边栏保留），
  但**捕获不到同段 layout 自身抛的错** —— 那种情况冒泡到根 `app/error.tsx`（无侧边栏，可接受）

**留给 apply 阶段实测的两点**（不阻塞，但要明确验证，不能默认成立）：

- **layout 与 page 会不会重复请求学员名单**。二者取的是同一个 GET，Next 的
  request memoization 理应在同一次渲染内合并成一次真实请求。**若实测没合并**，
  接受两次请求（内部工具、个位数用户），不为此引入计数专用端点 ——
  但要在验收里记下实际结果，不能假设
- **高亮是否真的即时**（见 Constraints 里 `usePathname` 那条的兜底方案）

## Design System

沿用既有实现。加载态与错误态的视觉基准是**已经上线的**
`app/students/loading.tsx` 与 `app/students/error.tsx` —— 本 change 不新增设计元素，
只是把它们从"整屏"改成"内容区"，并给课程页做一份同构的。

propose 阶段的 mocks 产物写成导览：标明卡片在内容区内的定位方式、
侧边栏在加载/错误态下必须保持可见、以及三态时序（点击 → 高亮即时 → 内容区卡片 → 新内容）。

## Referenced Capabilities

- **ADD `app-shell`（新能力）** —— 侧边栏与路由组不属于任何单一业务能力，硬塞进
  `student-roster` 或 `course-catalog` 都会让"谁拥有导航"变得含混。它拥有：
  数据页之间侧边栏保持可见、高亮跟随当前路由、加载/错误态只替换内容区、
  layout 取数不得阻塞导航、路由组之外的错误兜底
- MODIFY `course-catalog` —— 新增「课程页的加载态与错误态」需求，与 `student-roster`
  已有的两条同构（文案说明长等待；重试须真正重新取数）
- **`student-roster` 不改**。原以为要动，逐字读过之后确认不必：它那两条写的是
  「学员名单页 SHALL 在数据获取期间呈现加载态……文案含等待说明」与
  「SHALL 呈现可读的错误说明与重试入口」——**都没有规定占多大面积**。
  呈现范围由 `app-shell` 统一规定，两条原文继续成立。
  这同时避开了 `openspec archive` 按标题匹配 MODIFIED 的坑（改标题会中止并回滚整次归档）

## 遗留

- **学员名单的排序（`ORDER BY name, email`）至今不在 `student-roster` 的 spec 里**
  —— 上一个 change 记下的洞，仍未补。本 change 不碰
- **预取与 `staleTimes` 调优**未做（见 Non-Goals）。若做完本 change 讲师仍觉得慢，
  那是"等待时长"问题，与本 change 的"等待反馈"问题分开处理
