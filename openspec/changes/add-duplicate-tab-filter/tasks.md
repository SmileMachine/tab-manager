# 实现任务

- [x] 1.1 增加可扩展的 `DuplicateDetectionStrategy` 类型与默认 URL、title 策略。
- [x] 1.2 实现从 `BrowserSnapshotView` 计算重复标签页 ID 的纯函数，并覆盖空值、跨窗口和多策略合并测试。
- [x] 1.3 将 `duplicatesOnly` 接入 `TabFilters` 与 `applyTabFilters`，保持现有过滤器和原生顺序。
- [x] 1.4 在 manager 筛选栏增加 `Duplicates` toggle button，并接入视图状态。
- [x] 1.5 增加按钮交互与组合筛选测试，补充必要的样式和无障碍状态。
- [x] 1.6 运行单元测试、TypeScript/WXT 构建和 OpenSpec 严格校验。
