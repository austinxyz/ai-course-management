### Contract
- **Spec**:
  - 学员详情 SHALL 列出该学员的全部报课记录，每条 SHALL 显示课程、场次（未定时明确标出）、
    报名日期与当前状态。SHALL 提供「补录报课」入口。没有任何报课时 SHALL 明确说明，而不是留空。
  - 归档确认 SHALL 告知该学员当前有多少条报课记录。
- **Runtime**: `cd frontend && npm run test` → expected: 报课区块与补录弹窗的新测试通过，
  既有 122 项无回归；`npm run build` 与 `npx tsc --noEmit` 通过
- **Code**:
  - **新建路径要把所有字段都送出去**（`student-write` 的 pitfall：只送必填字段，
    其余被静默丢弃且后端有默认值所以不报错）；前后端字段名映射要核对
  - 前端**不参与状态派生**，只渲染后端给的 `state`
  - 写入失败按对象分开存错误、关闭只在成功回调里做、写入期间禁用所有出口（含取消）
  - Server Action 的预期内失败用**返回值**表达，不要抛 —— 生产构建会把抛出的信息抹成 digest
- **Threshold**: 70
