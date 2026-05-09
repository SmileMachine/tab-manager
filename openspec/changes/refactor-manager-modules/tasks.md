## 1. 准备

- [ ] 1.1 确认当前 `npm run check` 通过，作为重构前基线。
- [ ] 1.2 记录 `App.tsx` 中待迁移的组件、hooks 和 helper，避免同一逻辑迁移到多个位置。

## 2. 组件拆分

- [ ] 2.1 迁移 `BulkCloseDialog`、`GroupSummaryRow` 和 `GroupLabel` 到 `src/manager/components/`。
- [ ] 2.2 迁移 `WindowTitle`，保留 Escape stack 行为和 Enter 保存行为。
- [ ] 2.3 迁移 `GroupEditPopover`，保留外部点击关闭、Escape 关闭、实时更新和自动 focus 行为。
- [ ] 2.4 迁移 `SelectionContextMenu`，保留单个 tab 与已选 tab 的右键语义、菜单定位和 action 启用规则。
- [ ] 2.5 迁移 `TabRow`、draggable row 和 group summary droppable row，保留现有 `dnd-kit` 数据结构与 class 名。
- [ ] 2.6 迁移 `WindowSection`，保留 group label、row projection、selection 和 drag projection 的现有行为。

## 3. Hooks 与视图 helper 拆分

- [ ] 3.1 将 Escape stack React 接入迁移到 `src/manager/hooks/useEscapeStack.ts`。
- [ ] 3.2 将偏好加载和保存迁移到 `src/manager/hooks/useManagerPreferences.ts`。
- [ ] 3.3 将浏览器快照读取、外部事件 debounce 和选择修正迁移到 `src/manager/hooks/useBrowserSnapshot.ts`。
- [ ] 3.4 将 group label placement 迁移到 `src/manager/view/groupLabels.ts`。
- [ ] 3.5 将 context menu positioning、favicon URL、group options、window scope 序列化等纯 helper 迁移到 `src/manager/view/`。

## 4. 保留架构重构空间

- [ ] 4.1 确认命令执行逻辑没有被分散到展示组件中。
- [ ] 4.2 确认拖拽真实计划和拖拽预览没有被进一步分散。
- [ ] 4.3 确认组件不直接调用 `chrome.*`、`BrowserTabsApi` 或 preference storage。
- [ ] 4.4 确认 `App.tsx` 主要保留页面状态、数据流装配和顶层事件入口。

## 5. 验证

- [ ] 5.1 为迁移出的纯 helper 补充必要单元测试。
- [ ] 5.2 运行 `npm run test`。
- [ ] 5.3 运行 `npm run build`。
- [ ] 5.4 运行 `openspec validate refactor-manager-modules --strict`。
- [ ] 5.5 运行 `npm run check`。
