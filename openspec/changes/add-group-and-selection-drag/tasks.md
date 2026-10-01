## 1. 准备

- [x] 1.1 阅读 `refactor-manager-application-actions` 的 proposal、design 和 tasks，确认交错实现顺序。
- [x] 1.2 运行 `npm run check`，记录当前行为基线。

## 2. Group drag 支撑

- [x] 2.1 等待或同时完成 `refactor-manager-application-actions` 中的 `BrowserTabsApi.moveGroup()`。
- [x] 2.2 定义 group drag subject 和 group drop target 规则。
- [x] 2.3 为 group drag 计划增加单元测试，覆盖同 window 重排、跨 window 移动、拒绝拖入其他 group。
- [x] 2.4 实现 group drag 计划。

## 3. Group drag UI

- [x] 3.1 让 group label 或 group rail 可作为 group drag handle。
- [x] 3.2 在拖动过程中保持 group 整体视觉反馈。
- [x] 3.3 松手后调用 application action 执行 `moveGroup()`。
- [x] 3.4 写操作完成后刷新浏览器快照。

## 4. Selection drag 支撑

- [ ] 4.1 回到 `refactor-manager-application-actions`，迁移 selection 相关 actions。
- [ ] 4.2 定义 selection drag subject：拖动已选 tab 时 subject 为当前 selection；拖动未选 tab 时 subject 为单个 tab。
- [ ] 4.3 为 selection drag 计划增加单元测试，覆盖 view order、跨 window、加入 group 和移出 group。
- [ ] 4.4 实现 selection drag 计划，并复用计划结果生成预览和执行输入。

## 5. Selection drag UI

- [ ] 5.1 拖动已选 tab 时显示 selection drag 视觉反馈。
- [ ] 5.2 拖动未选 tab 时保持现有单 tab drag 行为。
- [ ] 5.3 松手后按 selection drag plan 执行浏览器写操作。
- [ ] 5.4 成功移动 selection 后清除选择或按产品决定保留选择。

## 6. 验证

- [x] 6.1 运行 `npm run test`。
- [x] 6.2 运行 `npm run build`。
- [x] 6.3 运行 `openspec validate add-group-and-selection-drag --strict`。
- [x] 6.4 运行 `openspec validate refactor-manager-application-actions --strict`。
- [x] 6.5 运行 `npm run check`。


## 7. Selection drag 缺陷修复（2026-10-01）

- [x] 7.1 添加同 window 和跨 window 批量入组回归测试，确认原实现逐个提交。
- [x] 7.2 按目标 group 聚合分组请求，并批量调整成员变化后的 group 顺序。
- [x] 7.3 为当前 Manager 的浏览器命令增加串行队列，整次拖拽使用一个独占执行边界。
- [x] 7.4 覆盖拖拽后立即菜单入组、连续两次拖拽、队列失败恢复和日志前后快照隔离。
- [x] 7.5 执行完整单元测试、Edge/Chrome 构建及 OpenSpec 严格验证。
- [ ] 7.6 在 Edge 中手动验证多选拖拽和连续入组请求的最终分组与视觉表现。
