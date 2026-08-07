### Contract
- **Spec**: 详情面板 SHALL 提供"发送邮件"入口，点击后 SHALL 弹确认对话框显示目标邮箱，取消 SHALL NOT 触发发送。确认后 SHALL 调用发送邮件接口，成功后历史立刻多一条记录不需要额外点击，失败时就地显示错误信息。（`specs/nudge/spec.md`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient` → expected: 全部通过，覆盖确认框显隐/确认后调用发送/取消不发送/失败报错不影响其他按钮
- **Code**: `NudgeClient.tsx` 的 `DetailPanel` 新增 `showConfirm` state + 手写 modal（同 `ImportDialog` 的 `fixed inset-0 z-50 ... bg-black/30` + `role="dialog"` 模式，design.md 决定 4）；`actions.ts` 新增 `sendNudgeEmail`；`api.ts` 新增对应 fetch 封装，失败复用既有 `BackendError`/`classify` 模式把 502 detail 透传成界面文案
- **Threshold**: 80
