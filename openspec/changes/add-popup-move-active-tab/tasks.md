# 实现任务

- [ ] 1.1 扩展 popup view-model，提供当前 active tab、跨 window group 候选、window 标签和当前所属 group。
- [ ] 1.2 增加 view-model 测试，覆盖当前窗口、其他窗口、空标题 group、当前 tab 已在目标 group 等状态。
- [ ] 2.1 在 popup 顶部增加带 tooltip 和可访问名称的“移动当前标签页”图标按钮。
- [ ] 2.2 实现紧凑 group picker，优先展示当前 window，并将其他 window 的 group 按窗口分组。
- [ ] 2.3 保持现有 group 行的跳转语义，避免将移动动作混入主导航行。
- [ ] 2.4 增加 picker 的键盘焦点、Escape 关闭、重复目标禁用和简短错误/空状态。
- [ ] 3.1 在 browser tabs API adapter 中实现同 window 与跨 window 的移动到 group 操作。
- [ ] 3.2 增加浏览器 API 调用顺序、跨 window 目标和失败处理测试。
- [ ] 4.1 移动成功后刷新 snapshot，验证统计信息与 group 列表同步更新。
- [ ] 4.2 在 Edge 中手动验证同 window、跨 window、无 group、重复目标和缩放场景。
- [ ] 4.3 运行测试、构建和 `openspec validate add-popup-move-active-tab --strict`。
- [ ] 4.4 完成差异审查后提交独立 commit。
