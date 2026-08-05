## 1. 后端：名单接口带出已跳过人数

### Contract
- **Spec**: 名单头部摘要行 SHALL 同时显示"未交"人数与"已跳过"人数。没有人被跳过时 SHALL 显示该数字为 0，不是隐藏这一项。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` → expected: 全部通过，覆盖响应形状变化（`items`/`skipped_count`）与跳过人数计算（含 0 人跳过的情形）
- **Code**: `GET /api/nudge?course=` 响应形状从裸数组改成 `{items, skipped_count}`（design.md 决定 4）；`skipped_count` 用一次独立的 `COUNT(DISTINCT student_email)` 查询（course 级别常数次，不随名单人数增长，走 `nudge_events` 既有复合索引），这是对 requirements 原文"零额外往返"的一处已披露偏离，design.md 里写明了原因
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/nudge-advanced/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — `backend/tests/test_nudge.py`：新增用例，某课程有 2 人未交、1 人被跳过，断言 `GET /api/nudge?course=` 返回体是 `{"items": [...], "skipped_count": 1}` 形状，`items` 长度为 2；此时端点还返回裸数组，断言应失败
- [ ] 1.2 GREEN — `backend/app/schemas.py` 加 `NudgeListRead{items, skipped_count}`；`nudge.py::list_nudge` 改用它作为 `response_model`，加 `skipped_count` 查询并包进返回体
- [ ] 1.3 RED — 新增用例：某课程没有任何人被跳过，断言 `skipped_count == 0`（不是缺失这个字段）
- [ ] 1.4 GREEN — 确认没有跳过事件时 `COUNT` 天然返回 0（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：三档文案模板 tab

### Contract
- **Spec**: 选中一人后 SHALL 展示三档固定文案模板（第一次提醒/第二次提醒/最后一次），SHALL 按该学员已催次数自动选中默认档位（0 次→第一档，1 次→第二档，≥2 次→第三档）；手动切换档位时，若草稿是当前档位未编辑过的默认文本，SHALL 替换为新档位默认文案，已编辑过的草稿 SHALL NOT 被切换动作覆盖。（`specs/nudge/spec.md`；UI 见 `docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#template-tabs-desktop`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient` → expected: 全部通过，覆盖默认档位选择/手动切换替换草稿/已编辑草稿不被切换覆盖
- **Code**: `NudgeClient.tsx` 新增 `TEMPLATES` 常量（三档固定文案）与 `defaultTemplateKey(nudgedCount)` 纯函数（design.md 决定 1）；`DetailPanel` 新增 `templateKey` state，随 `key={studentEmail}` 换人复位（沿用 MVP 已有的状态复位机制）；切换 tab 时用字符串相等比较判断"是否已编辑"
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/nudge-advanced/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#template-tabs-desktop 与 #mobile；记录 tab 文案（第一次提醒/第二次提醒/最后一次）、选中态样式、"按已催次数自动推荐"提示文案
- [ ] 2.2 RED — `frontend/app/(app)/nudge/NudgeClient.test.tsx`：新增用例，选中一名已催 0 次的学员，断言"第一次提醒"tab 处于选中态；此时组件没有模板 tab，测试应失败
- [ ] 2.3 GREEN — 实现 `TEMPLATES`、`defaultTemplateKey()`、`templateKey` state 与 tab 渲染
- [ ] 2.4 RED — 新增用例：选中已催 1 次的学员默认第二档、已催 2 次默认第三档
- [ ] 2.5 GREEN — 确认阈值判断正确（多数情况下 2.3 已经覆盖，这一步用于确认边界）
- [ ] 2.6 RED — 新增用例：手动点击另一个 tab，未编辑过的草稿替换成新档位默认文案
- [ ] 2.7 GREEN — 实现切换替换逻辑
- [ ] 2.8 RED — 新增用例：先编辑草稿，再点击另一个 tab，草稿文本不变（不被覆盖）
- [ ] 2.9 GREEN — 加"是否已编辑"判断（字符串相等比较当前草稿与当前档位默认文案）
- [ ] 2.10 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；核对模板 tab 与 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：导出名单 + 进度指示 + 头部统计行

### Contract
- **Spec**: 名单页 SHALL 提供"导出名单"入口，点击后 SHALL 生成 CSV（姓名/邮箱/微信/逾期天数/已催次数），SHALL NOT 为导出发起新的网络请求。名单页头部 SHALL 展示 3 步进度指示（算名单→起草文案→标记/跳过），SHALL NOT 出现"发送邮件"这一步。头部摘要行 SHALL 同时显示未交人数与已跳过人数。（`specs/nudge/spec.md`；UI 见 mock `#header-stats-desktop` `#progress-steps-desktop`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient page` → expected: 全部通过，覆盖 CSV 内容生成（不发请求）/进度指示三步/头部统计行含跳过人数
- **Code**: `NudgeClient.tsx` 新增 `toCsv(people)` 纯函数 + `Blob`/`URL.createObjectURL`/隐藏 `<a download>` 触发下载（design.md 决定 2）；进度指示是静态三步 JSX，不依赖新数据（design.md 决定 3）；`page.tsx`/`lib/api.ts::getNudgeList` 适配新的 `{items, skippedCount}` 响应形状
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/nudge-advanced/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#header-stats-desktop 与 #progress-steps-desktop 与 #mobile；记录"导出名单"按钮位置、3 步进度指示的文案与状态样式（已完成/当前/待办）、头部摘要行"N 人未交 · 已跳过 M 人"的措辞
- [ ] 3.2 RED — `frontend/lib/api.ts` 与 `frontend/app/(app)/nudge/types.ts`：`getNudgeList` 改造成返回 `{people, skippedCount}`；`frontend/app/(app)/nudge/page.test.tsx` 新增/改用例断言 `NudgeClient` 收到的 `skippedCount` 来自后端 `skipped_count` 字段；此时 `getNudgeList` 还返回裸数组，测试应失败
- [ ] 3.3 GREEN — 改造 `getNudgeList`、`page.tsx` 适配新响应形状
- [ ] 3.4 RED — `NudgeClient.test.tsx` 新增用例：头部摘要行同时显示"N 人未交"与"已跳过 M 人"（含 M=0 的情形）
- [ ] 3.5 GREEN — 实现头部统计行渲染
- [ ] 3.6 RED — 新增用例：页面渲染出 3 步进度指示，不包含"发送邮件"文案
- [ ] 3.7 GREEN — 实现静态进度指示组件
- [ ] 3.8 RED — 新增用例：点击"导出名单"，断言触发了 `Blob`/下载相关调用（mock `URL.createObjectURL`），且没有 `fetch` 被调用
- [ ] 3.9 GREEN — 实现 `toCsv()` 与下载触发逻辑
- [ ] 3.10 VISUAL DIFF — 核对导出按钮、进度指示、头部统计行与 mock 一致（同样的 Basic Auth 降级方案）
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证与收尾

- [ ] 4.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [ ] 4.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [ ] 4.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [ ] 4.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
