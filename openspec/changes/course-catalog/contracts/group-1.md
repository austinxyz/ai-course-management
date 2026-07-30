### Contract
- **Spec**:
  - 侧栏 SHALL 提供 `课程` 入口并指向课程页；该入口 SHALL NOT 再是占位页。`报课` SHALL 仍为占位页（不属于本能力）。
- **Runtime**: `cd frontend && npm run test` → expected: 既有 58 项无回归；`StudentsClient` 不再持有 `view` state 后相关测试改到新形状仍全绿；另需 `npm run build --prefix frontend` 通过
- **Code**:
  - 现状侧栏是 `onNavigate → setView`，整站只有 `/students` 一个数据页。课程页做成 `StudentsClient` 的分支会让该组件同时持有两套数据，且打开学员名单要顺带查课程表
  - `Sidebar` props 从 `(view, onNavigate)` 变为 `(active)`；`<button onClick>` 改 `next/link`；占位页从 `StudentsClient` 分支变成各自路由（`/enroll`、`/homework`、`/nudge`、`/interactions`）
  - 本组**只改导航、不加功能**，单独提交，让回归面看得清
- **Threshold**: 80
