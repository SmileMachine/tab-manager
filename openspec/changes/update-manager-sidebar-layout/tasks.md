# 实现任务

- [x] 1.1 复核当前 `WorkspaceShell`、`SnapshotWorkspace`、manager preferences 和响应式 CSS，确认不改变快照业务状态。
- [x] 1.2 为 `WorkspaceShell` 增加独立滚动容器和视口高度约束，处理桌面与移动端布局。
- [x] 1.3 为 `WorkspaceShell` 增加可拖动、可键盘操作的宽度分隔线，并实现宽度 clamp 和 pointer capture。
- [x] 1.4 统一侧边栏收起、展开与可调整宽度之间的状态关系，保留最近一次展开宽度。
- [x] 1.5 增加 Current、Snapshot 共用 shell 的布局交互测试。
- [x] 1.6 完成 TypeScript、测试、WXT build、OpenSpec 严格校验和 `git diff --check`。
- [ ] 1.7 在 Edge 中手动验证侧边栏滚动、主内容滚动、拖动宽度、键盘调整、收起与恢复。
