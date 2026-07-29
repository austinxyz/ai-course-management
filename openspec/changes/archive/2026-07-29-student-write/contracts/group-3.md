# Contract — Group 3: 前端接线（删本地状态 + 保存中/失败态）

- **Spec**: 更新 SHALL 落库并在页面刷新后依然存在（字段、标签、备注）。新增记录 SHALL 落库并出现在名单中；邮箱属于已归档学员时 SHALL NOT 自动恢复或覆盖。归档后 SHALL 从在读名单消失、恢复后字段与归档前一致。界面 SHALL 在写入进行中给出可见的进行中状态，并在失败时给出失败提示；失败时 SHALL 保留用户已输入的内容，SHALL NOT 回退为旧值。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 通过，含 保存中状态渲染、失败时输入被保留、失败提示就近显示 三组断言
- **Code**: design.md 决策 #1（删除 `over`/`added`/`archived` 三块本地状态与 `applyOverride`，服务端成为唯一真相源；保留的本地状态仅为纯 UI 态）、#7（保存中/失败是 per-field 而非全局）。**回归风险**：筛选、选中、在读/已归档切换、新增弹窗都读这些被删的状态，改动面远大于"加几个写接口"
- **Threshold**: 70

- [x] 3.0 CONTRACT — write openspec/changes/student-write/contracts/group-3.md with the
