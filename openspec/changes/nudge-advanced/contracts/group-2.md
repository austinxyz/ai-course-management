### Contract
- **Spec**: 选中一人后 SHALL 展示三档固定文案模板（第一次提醒/第二次提醒/最后一次），SHALL 按该学员已催次数自动选中默认档位（0 次→第一档，1 次→第二档，≥2 次→第三档）；手动切换档位时，若草稿是当前档位未编辑过的默认文本，SHALL 替换为新档位默认文案，已编辑过的草稿 SHALL NOT 被切换动作覆盖。（`specs/nudge/spec.md`；UI 见 `docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#template-tabs-desktop`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient` → expected: 全部通过，覆盖默认档位选择/手动切换替换草稿/已编辑草稿不被切换覆盖
- **Code**: `NudgeClient.tsx` 新增 `TEMPLATES` 常量（三档固定文案）与 `defaultTemplateKey(nudgedCount)` 纯函数（design.md 决定 1）；`DetailPanel` 新增 `templateKey` state，随 `key={studentEmail}` 换人复位（沿用 MVP 已有的状态复位机制）；切换 tab 时用字符串相等比较判断"是否已编辑"
- **Threshold**: 70
