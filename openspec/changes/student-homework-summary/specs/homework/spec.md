## ADDED Requirements

### Requirement: 作业页支持深链接直接选中某学员

`/homework` 页 SHALL 接受一个 `student` query 参数（学员邮箱）。存在该参数且该邮箱在当前课程名单里时，页面加载时 SHALL 自动展开该学员的详情面板，无需用户再手动点击名单行。参数缺失或指向的邮箱不在当前课程名单里时，SHALL 保持原有行为（不自动选中任何人）。

理由：学员详情页的报课记录会链接到本页看某学员某门课的作业详情，深链接让这次跳转直接落在目标学员的详情面板上，不需要用户再从名单里重新找一遍。

#### Scenario: 带 student 参数且该学员在名单里
- **WHEN** 访问 `/homework?course=<courseId>&student=<email>`，该邮箱是这门课名单里的一个人
- **THEN** 页面加载后该学员的详情面板已经展开，无需再次点击

#### Scenario: student 参数指向的人不在当前课程名单里
- **WHEN** 访问 `/homework?course=<courseId>&student=<email>`，该邮箱不在这门课的名单里（比如没有报这门课）
- **THEN** 页面正常显示名单，不自动展开任何人的详情面板，也不报错

#### Scenario: 没有 student 参数
- **WHEN** 访问 `/homework?course=<courseId>`（不带 `student`）
- **THEN** 行为与本次变更之前完全一致——不自动选中任何人
