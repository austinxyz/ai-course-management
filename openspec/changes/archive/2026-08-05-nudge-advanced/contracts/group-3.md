### Contract
- **Spec**: 名单页 SHALL 提供"导出名单"入口，点击后 SHALL 生成 CSV（姓名/邮箱/微信/逾期天数/已催次数），SHALL NOT 为导出发起新的网络请求。名单页头部 SHALL 展示 3 步进度指示（算名单→起草文案→标记/跳过），SHALL NOT 出现"发送邮件"这一步。头部摘要行 SHALL 同时显示未交人数与已跳过人数。（`specs/nudge/spec.md`；UI 见 mock `#header-stats-desktop` `#progress-steps-desktop`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient page` → expected: 全部通过，覆盖 CSV 内容生成（不发请求）/进度指示三步/头部统计行含跳过人数
- **Code**: `NudgeClient.tsx` 新增 `toCsv(people)` 纯函数 + `Blob`/`URL.createObjectURL`/隐藏 `<a download>` 触发下载（design.md 决定 2）；进度指示是静态三步 JSX，不依赖新数据（design.md 决定 3）；`page.tsx`/`lib/api.ts::getNudgeList` 适配新的 `{items, skippedCount}` 响应形状
- **Threshold**: 70
