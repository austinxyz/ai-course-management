### Contract
- **Spec**:
  - 导航徽标展示的计数 SHALL 在相关数据被写入后随即更新，无需用户手动刷新页面。
- **Runtime**: `cd frontend && npm run test` → expected: 学员写操作的 revalidate 调用被断言为
  layout 粒度且路径写法正确，既有 actions 测试无回归。**单测不足以定论**，须配合 3.3 的真实写入
- **Code**:
  - 徽标进 layout 后 page 粒度的 `revalidatePath` **不会**刷新它
  - **路由组会改变路径写法**：文档示例是 `revalidatePath('/(main)/post/[slug]', 'layout')`，
    所以可能要写 `/(app)/students`。**实测确认，不靠读代码**
  - 写错的症状是"加完学员徽标不动"，与"根本没改粒度"**外观完全一致**
- **Threshold**: 80
