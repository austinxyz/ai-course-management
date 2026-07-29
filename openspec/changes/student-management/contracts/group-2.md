### Contract
- **Spec**: 系统 SHALL 通过 `GET /api/students` 返回全部学员记录，字段覆盖姓名/邮箱/微信号/微信昵称/区域/基础/来源/标签/备注；空库返回空数组而非报错。系统 SHALL 通过 `GET /api/students/{email}` 返回该邮箱对应的学员完整记录（大小写不敏感匹配）；邮箱不存在时 SHALL 返回 404。未采集微信号的学员，API SHALL 返回空字符串 `""`。
- **Runtime**: `cd backend && pytest` → expected: 全部新增测试通过，覆盖列表/详情/空库/404/大小写匹配五种场景
- **Code**: design.md 决策 #4（`tz` 不入库，按 `region` 动态算）、#8（邮箱查询用 `lower()` 比较，不引入 citext）
- **Threshold**: 80
