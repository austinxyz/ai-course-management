### Contract
- **Spec**: 「待回复」筛选与计数改用后端返回的 `replied` 字段判定，不再看 `replyStatus`。详情面板在「回复状态」字段之后新增独立的「讲师标记」控件：未标记时显示「标记已回复」按钮；标记后显示徽章 + 时间戳 + 「标记未回复」按钮，可来回切换。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient api actions` → expected: 全部通过，新增用例覆盖标记/取消标记按钮渲染、筛选联动、类型/API 层字段同步
- **Code**: mock 稿 `docs/superpowers/specs/mocks/2026-08-02-homework-reply-status-mocks.html#detail-panel-reply-toggle`——回复状态原文与讲师标记两行分开展示；两个动作式端点通过 `lib/api.ts` 的 `markHomeworkReplied`/`markHomeworkUnreplied` 调用，`actions.ts` 里对应两个 Server Action（先 `requireSitePassword`，成功后 `revalidatePath("/homework", "layout")`，与现有 `submit()` 一致的粒度）；`DetailPanel` 挂 `key={person.studentEmail}`，避免切换选中人时标记按钮的本地 busy/error 状态串到下一个人身上；按钮只在 `person.total !== null`（即存在提交、从而有 `submissionId`）时渲染
- **Threshold**: 70
