## 1. 准备

- [ ] 1.1 阅读 `add-group-and-selection-drag` 的 proposal、design 和 tasks，确认两个 change 的交错实现顺序。
- [ ] 1.2 运行 `npm run check`，记录当前行为基线。

## 2. 非拖拽 actions

- [ ] 2.1 新增 `src/manager/application/tabActions.ts`，迁移 close、discard、activate 等 tab actions。
- [ ] 2.2 新增 `src/manager/application/groupActions.ts`，迁移 update group。
- [ ] 2.3 为迁移出的 actions 增加 fake `BrowserTabsApi` 测试，覆盖成功和禁用条件。
- [ ] 2.4 验证 `App.tsx` 只保留 UI 状态连接和 action 调用。

## 3. 支撑 group drag

- [ ] 3.1 在 `BrowserTabsApi` 中增加 `moveGroup(groupId, targetWindowId, targetIndex)`。
- [ ] 3.2 在 Chrome adapter 中使用 `chrome.tabGroups.move(groupId, { windowId, index })` 实现 group move。
- [ ] 3.3 为 `moveGroup` adapter 行为增加测试。
- [ ] 3.4 与 `add-group-and-selection-drag` 的 group drag 任务交错执行，不等待所有重构完成。

## 4. Selection 相关 actions

- [ ] 4.1 迁移 create group、move selected tabs to group、ungroup。
- [ ] 4.2 保留创建 group 后打开编辑框和 selection 清理行为。
- [ ] 4.3 为 selection 相关 actions 增加测试。
- [ ] 4.4 与 `add-group-and-selection-drag` 的 selection drag 任务交错执行。

## 5. 验证

- [ ] 5.1 运行 `npm run test`。
- [ ] 5.2 运行 `npm run build`。
- [ ] 5.3 运行 `openspec validate refactor-manager-application-actions --strict`。
- [ ] 5.4 运行 `openspec validate add-group-and-selection-drag --strict`。
- [ ] 5.5 运行 `npm run check`。
