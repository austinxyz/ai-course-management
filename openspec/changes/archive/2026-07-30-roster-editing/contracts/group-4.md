### Contract
- **Spec**: N/A — 重构组，无对应 SHALL。约束来自 requirements Goals 第 3、4 条（词表脱离 `mock-data` 这个名字；删掉合成的「学员 ID」行）与 Success Criteria 12、13
- **Runtime**: `cd frontend && npm run test` → expected: 前端全套用例无回归；另需 `npm run build --prefix frontend` 通过（漏改 import 会在编译期暴露，这是本组最主要的失败模式）
- **Code**:
  - 用 `git mv mock-data.ts vocab.ts`，让 diff 呈现为 rename 而非"新增 145 行 + 删除 145 行"，review 时能一眼确认内容未变；同一提交里只改 import 语句
  - **搬迁与删除分两个提交**：搬迁是"内容不变、位置变"，删除是"内容变"。混在一起一旦 UI 出问题，分不清是搬错了还是删多了
  - `sid` 三处一起删（`FIELDS` 那行、`DetailPanel.tsx:82` 的合成、`:159` 的三元分支）；它是唯一 `type: "ro"` 字段，删后 `:228`/`:241` 的 `ro` 分支成为死代码，一并删除。`EditableFieldKeyLike` 收缩为 `keyof Student`，顺势收紧 `as unknown as Record<string, string>` 逃逸转型
  - 在 `TZ_BY_REGION` 上方加注释指明 `backend/app/schemas.py` 有同源副本、两边需同步——本 change 不统一，但必须留线索
- **Threshold**: 70
