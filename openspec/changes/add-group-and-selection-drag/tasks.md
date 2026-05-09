## 1. 准备

- [x] 1.1 阅读 `refactor-manager-application-actions` 的 proposal、design 和 tasks，确认交错实现顺序。
- [x] 1.2 运行 `npm run check`，记录当前行为基线。

## 2. Group drag 支撑

- [x] 2.1 等待或同时完成 `refactor-manager-application-actions` 中的 `BrowserTabsApi.moveGroup()`。
- [x] 2.2 定义 group drag subject 和 group drop target 规则。
- [x] 2.3 为 group drag 计划增加单元测试，覆盖同 window 重排、跨 window 移动、拒绝拖入其他 group。
- [x] 2.4 实现 group drag 计划。

## 3. Group drag UI

- [ ] 3.1 让 group label 或 group rail 可作为 group drag handle。
- [ ] 3.2 在拖动过程中保持 group 整体视觉反馈。
- [ ] 3.3 松手后调用 application action 执行 `moveGroup()`。
- [ ] 3.4 写操作完成后刷新浏览器快照。

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

- [ ] 6.1 运行 `npm run test`。
- [ ] 6.2 运行 `npm run build`。
- [ ] 6.3 运行 `openspec validate add-group-and-selection-drag --strict`。
- [ ] 6.4 运行 `openspec validate refactor-manager-application-actions --strict`。
- [ ] 6.5 运行 `npm run check`。
