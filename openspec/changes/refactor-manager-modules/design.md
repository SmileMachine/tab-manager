# Design: Manager 模块拆分

## 背景

`manager` 页面已经承担了浏览器标签页管理器的大部分产品能力。它包含所有窗口读取、筛选、选择、右键菜单、group 编辑、批量关闭、拖拽预览、乐观更新、偏好保存和页面渲染。领域层已有若干纯函数和测试，这说明系统并非完全没有结构；问题主要集中在 `src/manager/App.tsx` 的应用层与视图层混合。

第一阶段采用方案 B：先做结构性模块拆分，同时为后续应用层和拖拽模型重构预留清晰位置。此阶段不改变用户可见行为，不改变浏览器 API 调用语义，不重新设计拖拽算法。

## 目标

- 让 `App.tsx` 回到页面装配角色，减少直接包含的组件实现、overlay 实现和通用 helper。
- 将窗口区块、tab 行、group label、菜单、编辑框和 dialog 拆为独立组件模块。
- 将偏好加载保存、浏览器快照同步、Escape stack 等可复用生命周期逻辑放入 hooks。
- 将菜单定位、group label placement、favicon URL、窗口范围序列化等视图辅助逻辑迁移到 `view` 模块。
- 保留现有领域函数，不在第一阶段合并拖拽真实计划和拖拽预览。
- 每个迁移步骤后保持测试与构建可通过。

## 非目标

- 不改变 `BrowserSnapshot`、`BrowserSnapshotView`、`WindowRow` 等领域模型。
- 不改变现有 UI 文案、交互语义、视觉样式和 CSS class 名。
- 不改变拖拽排序和拖入 group 的算法。
- 不引入新的状态管理库。
- 不把所有函数都机械迁移到新文件；只有接口清楚、调用者收益明确的模块才迁移。

## 目标结构

第一阶段目标结构如下：

```text
src/manager/
  App.tsx
  escapeStack.ts
  components/
    BulkCloseDialog.tsx
    GroupEditPopover.tsx
    GroupLabel.tsx
    GroupSummaryRow.tsx
    SelectionContextMenu.tsx
    TabRow.tsx
    WindowSection.tsx
    WindowTitle.tsx
  hooks/
    useBrowserSnapshot.ts
    useEscapeStack.ts
    useManagerPreferences.ts
  view/
    contextMenuPosition.ts
    faviconUrl.ts
    groupLabels.ts
    groupOptions.ts
    windowScope.ts
```

这个结构的重点不是文件数量，而是模块责任。`components` 只负责渲染和用户事件转发；`hooks` 负责生命周期与 React state 接入；`view` 负责从已有 view model 派生渲染所需的轻量数据。第一阶段仍允许 `App.tsx` 持有主要页面状态，因为更深的状态重构属于后续阶段。

## 模块边界

`App.tsx` 应保留：

- 顶层页面状态。
- 顶层数据流装配。
- `DndContext` 与主要事件入口。
- 各组件之间的回调连接。

`components` 应避免直接调用 `chrome.*` 或 `BrowserTabsApi`。它们通过 props 接收数据和事件回调。

`hooks` 可以接收 adapter 或存储函数，但不应知道具体 DOM 结构。

`view` 模块应保持纯函数优先。它可以依赖 domain 类型，但不应依赖 React。

## 风险控制

第一阶段的主要风险不是业务逻辑错误，而是 props 传递遗漏、组件拆分后的引用循环、以及 CSS class 或 DOM 层级变化造成视觉回归。因此迁移应按小步骤进行：

1. 先迁移无状态或低状态组件，例如 `BulkCloseDialog`、`GroupSummaryRow`、`GroupLabel`。
2. 再迁移包含局部状态但接口清晰的组件，例如 `WindowTitle`、`GroupEditPopover`、`SelectionContextMenu`。
3. 然后迁移 `WindowSection` 与 tab row 渲染。
4. 最后迁移 hooks 和 view helpers。

每一步都应尽量保持导出的 props 类型明确，避免把 `ManagerApp` 的整个状态对象传给子模块。

## 后续兼容性

方案 B 的拆分必须服务于后续方案 C，而不是形成新的阻碍。具体要求如下：

- 命令执行函数暂时可以留在 `App.tsx`，但迁移时不能把它们散到多个组件内部。
- 拖拽相关 helper 可以迁移到 view 模块，但不应把真实计划和预览计划进一步分散。
- 组件不应直接读写偏好存储，以免后续 application 模块无法统一管理状态变化。
- 新模块命名应贴近领域概念，例如 `WindowSection`、`GroupLabel`、`SelectionContextMenu`，避免抽象但含义不清的命名。

## 验证

第一阶段每个合理批次完成后运行：

- `npm run test`
- `npm run build`
- `openspec validate refactor-manager-modules --strict`

最终提交前运行：

- `npm run check`

如果拆分中发现现有行为没有测试覆盖，可以为被迁移的纯函数补充单元测试。组件视觉行为以不改变 DOM 结构和 class 名为主要约束。
