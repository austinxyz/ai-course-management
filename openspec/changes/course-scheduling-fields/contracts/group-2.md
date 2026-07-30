### Contract
- **Spec**:
  - 场次时间 SHALL 以「本地日期 + 本地时间 + IANA 时区名」存储，SHALL NOT 存固定的 UTC 偏移小时数。该时区 SHALL 由录入时指定，缺省取课程默认时区。
  - 换算基准 SHALL 是该场次自己的时区，SHALL NOT 是某个写死的时区。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_sessions.py -q` → expected: 以美东 20:30、2026-07-31 建的场次，其 `starts_at` 对应美西 17:30 同日、上海 08:30 次日；既有的美西 10 月/12 月断言不回退
- **Code**:
  - `starts_at` 已由 `zoneinfo` 在读取时算，本组只需确认它对**非美西**的 `tz` 同样成立 —— 换言之这组主要是补断言，实现可能已经满足
  - 断言**必须写死日期**：同样是美东 20:30，12 月那场的上海行是 09:30 次日。不锁日期的断言会在换季后自己变红
  - 时区名校验在创建与更新两条路径都要生效（group 4 已加，本组确认不回退）
- **Threshold**: 80
