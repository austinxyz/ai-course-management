---
Date: 2026-07-30
Change: course-page-boundaries
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-30-course-page-boundaries-requirements.md
---

## Why

讲师报「切换左侧 tab，感觉刷新有点问题」。生产实测：切 tab 时侧边栏整块消失又出现，
高亮要等新页面渲染完才动；而 `/courses` 连 `loading.tsx` 都没有，点了之后屏幕
纹丝不动 646ms（Render 冷启动时是几十秒）。导航本身是好的（软导航，一次 `_rsc=` 请求），
问题全在反馈。根因是 **`Sidebar` 由每个 page 各自渲染**，于是加载态与错误态只能整屏替换。

## What Changes

- 新建路由组 `app/(app)/`，`Sidebar` 提到该组的 `layout.tsx`；students、courses
  与四个占位页（报课/作业/催作业/互动记录）迁入
- 侧边栏高亮由 `usePathname` 派生，不再由各 page 传 `active` prop
- 学员数徽标的计数改由 layout 取，**包在 `<Suspense>` 里** —— 本版 Next 文档明写
  layout 的未缓存取数会阻塞导航，不包等于把问题放大
- 学员写操作的 `revalidatePath` 从 page 粒度改为 layout 粒度，否则徽标不刷新
- 新增 `app/(app)/courses/loading.tsx`（课程页此前没有加载态）
- 新增 `app/(app)/error.tsx`（渲染在侧边栏之内）与 `app/error.tsx`（路由组之外的中文兜底）
- `app/students/{loading,error}.tsx` 迁入路由组；文案不变，呈现范围从整屏改为内容区

## Capabilities

### New Capabilities

- `app-shell` —— 应用外壳与导航反馈。侧边栏在数据页之间保持可见、高亮跟随当前路由、
  加载/错误态只替换内容区、layout 取数不得阻塞导航、路由组之外的错误兜底。
  这些不属于任何单一业务能力，塞进 `student-roster` 或 `course-catalog` 都会让
  「谁拥有导航」变得含混

### Modified Capabilities

- `course-catalog` —— 新增「课程页的加载态与错误态」需求，与 `student-roster`
  已有的两条同构（文案说明可能的长等待；重试须真正重新取数）

**`student-roster` 不改。** 逐字读过它的「加载态的等待预期管理」与「后端不可达时的降级」：
两条只规定文案与重试行为，**都没有规定占多大面积**。呈现范围由 `app-shell` 统一规定，
原文继续成立。

## Impact

- `frontend/app/` 目录结构（新建 `(app)/` 路由组，六个 page 迁入）
- `frontend/app/students/Sidebar.tsx` —— `active` prop 改为内部派生，成为客户端组件
- `frontend/app/students/actions.ts` —— 四处 `revalidatePath` 调用
- 新增 4 个文件：`(app)/layout.tsx`、`(app)/error.tsx`、`(app)/courses/loading.tsx`、`app/error.tsx`
- 现有前端测试：引用 `app/students/*` 与 `app/courses/*` 路径的测试文件需跟随移动
- **不碰后端**，不改任何 API，无 schema 变更

## Out of Scope

- **预取与 `staleTimes` 调优** —— 本 change 治「等待反馈」，不治「等待时长」。
  二者混在一起会分不清是哪一项起的作用。做完若讲师仍觉得慢，另开
- **骨架屏**（仿表格/卡片形状那种）—— 冷启动场景下"约 1 分钟"的文案价值高于形状仿真
- **`global-error.tsx`** —— 只在根 layout 自身抛错时用得上，而根 layout 只加载字体与
  全局样式、不取数据。已知且接受的缺口
- **顶部进度条**
- **学员名单排序入 spec** —— `course-list-order` 记下的遗留洞，仍未补，本 change 不碰
