### Contract
- **Spec**:
  - 名单页的检索 SHALL 匹配姓名、邮箱、微信昵称、微信名、微信号五个字段，任一字段包含查询串即视为命中，匹配 SHALL 大小写不敏感。检索 SHALL NOT 匹配标签与备注。
  - 检索是**人工对齐时的辨认辅助**，SHALL NOT 被实现为按微信昵称自动关联、自动去重或自动建档的逻辑。
- **Runtime**: `cd frontend && npm run test` → expected: 五字段命中、大小写不敏感、备注/标签不命中，全部通过；既有「按姓名/邮箱搜索」用例无回归
- **Code**:
  - 实现形态限定为 `hay.some(v => v.toLowerCase().includes(q))`，`q` 已 trim + 小写。**不做**模糊匹配、拼音、相似度排序——那会把「辨认辅助」变成「自动猜人是谁」，而微信昵称不能作为标识（`docs/requirements.md` §5，CLAUDE.md 同款禁令，design 规则里是 BLOCK 级）
  - 不纳入 `region`/`level`/`source`（已有独立筛选器，纳入后结果难以解释）；不纳入备注（大段 Demo Day 文案会让噪音压过信号）
  - 已知边缘：`nick`/`wxName` 未采集时默认值是 `—`，查询串 `—` 会命中所有未采集者，**有意不特殊处理**
- **Threshold**: 80
