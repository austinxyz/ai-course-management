### Contract
- **Spec**: 讲师点"标记已催"后名单 SHALL NOT 移除该学员，"已催次数"/"上次催促时间" SHALL 更新；点"跳过"后该学员 SHALL 从名单消失。编辑草稿只影响当次展示，SHALL NOT 影响下次选中同一人或切换到其他人后的默认模板。（`specs/nudge/spec.md`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient actions` → expected: 全部通过，覆盖标记已催/跳过调用对应 Server Action 并触发重新取数、复制文案不发请求、编辑草稿不污染下次选中的默认值
- **Code**: `frontend/app/(app)/nudge/actions.ts` 新建 `markNudged`/`skipNudge` 两个 Server Action（参照 `homework/actions.ts` 的 `requireSitePassword` + `classify` 错误处理模式），成功后 `revalidatePath("/nudge", "layout")`；"复制文案"用浏览器 `navigator.clipboard`，纯前端、不经过 Server Action
- **Threshold**: 80
