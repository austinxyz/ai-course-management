### Contract
- **Spec**:
  - 用户 SHALL 能修改一条已有报课的场次，包括清空它（改回未定场次）；SHALL 能删除一条报课。
    二者 SHALL 都在学员详情里进行。
  - 学员详情的报课区块 SHALL 为每条记录提供修改场次（含清空）与删除的入口。
- **Runtime**: `cd frontend && npm run test` → expected: 改场次/清空/删除三条新测试通过，
  既有 144 项无回归；`npm run build` 与 `npx tsc --noEmit` 通过
- **Code**:
  - 错误状态按**报课 id** 分开存，失败信息渲染在**那一条**上（几条可以各自处于不同状态）
  - 写入期间禁用该条的**所有**出口（含取消）；关闭编辑态只在成功回调里做
  - 测试用**挂住不 resolve 的 promise** 断言 `disabled` —— 只断言最终态对这类回归全盲
  - Server Action 的预期内失败用**返回值**表达，不要抛（生产构建会把抛出的信息抹成 digest）
  - 前端**不参与状态派生**，改完场次后的状态以后端返回为准
- **Threshold**: 70
