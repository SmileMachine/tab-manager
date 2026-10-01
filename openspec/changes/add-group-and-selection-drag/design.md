# Design: Group 与 Selection 拖动

## 背景

当前 manager 支持单个 tab 拖动。接下来要增加两个能力：整体拖动原生 group，以及一次性拖动已选中的 tabs。这两个能力表面上都属于拖拽，但浏览器 API 支撑不同。

Group 整体移动应使用原生 `chrome.tabGroups.move()`。它表达的是“移动一个原生 tab group 的位置”，而不是把 group 拆成多个 tabs 后再移动。Selection 拖动没有对应的整体 API，需要继续通过 tabs move/group/ungroup 组合实现。

因此，这个功能不应强行用同一套底层执行方式处理。正确的共同点是拖拽 UI 与 drop target 识别；执行层应区分 group drag 和 selection drag。

## 产品规则

Group drag 的规则：

- 允许在同一个 window 内调整 group 顺序。
- 允许把 group 整体移动到另一个 normal window。
- 不允许把一个 group 整体拖入另一个 group。
- 如果用户想把某个 group 内所有 tabs 移入另一个 group，应先选择这些 tabs，再使用 selection drag 或右键菜单动作。
- group drag 不改变 manager 内 group collapse 状态与浏览器原生 collapse 状态之间的既有规则。

Selection drag 的规则：

- 当存在多个已选 tabs，拖动其中一个已选 tab 时，拖动 subject 应为整个 selection。
- 当拖动未选中 tab 时，拖动 subject 仍为单个 tab。
- Selection 内 tabs 的顺序按当前 manager view order 计算。
- Selection drag 可以移动到另一个 window。
- Selection drag 是否加入目标 group 或移出 group，应遵循 drop target 的语义。

## 与重构的关系

本 change 与 `refactor-manager-application-actions` 交错实现。

推荐顺序是：

1. 先在重构 change 中增加 `BrowserTabsApi.moveGroup()`。
2. 在本 change 中增加 group drag subject、drop target 识别和最小 group drag 执行。
3. 回到重构 change，迁移 selection 相关 actions。
4. 在本 change 中实现 selection drag。

这样可以避免两种极端：既不先做完整重构而长时间没有功能，也不把新功能绕过 application layer 直接加入 UI。

## Drag Subject

拖动对象应显式建模：

```ts
type DragSubject =
  | { kind: 'tab'; tabId: NativeTabId }
  | { kind: 'selection'; tabIds: NativeTabId[] }
  | { kind: 'group'; groupId: NativeGroupId };
```

第一步可以只把 group subject 和现有 tab subject 放入模型。Selection subject 可以在后续 slice 中加入，但命名和 drop data 不应阻碍它。

## Group Drag 执行

Group drag 应通过 application action 调用 `BrowserTabsApi.moveGroup(groupId, targetWindowId, targetIndex)`。adapter 内部使用 `chrome.tabGroups.move(groupId, { windowId: targetWindowId, index: targetIndex })`。

Group drop target 不应是“目标 group”。它应表达为 window 内的一个位置，例如某个 tab/group 边界之前或之后。UI 可以复用现有行级 drop 识别，但计划层必须拒绝“group into group”的解释。

## Selection Drag 执行

Selection drag 应建立计划函数，输入当前 `BrowserSnapshotView`、selection tab ids 和 drop target。计划应计算：

- 待移动 tab ids，按 manager view order 排列。
- 目标 window。
- 目标 index。
- 是否 join group 或 ungroup。

Selection drag 的预览和最终执行必须使用同一套计划结果派生，避免再次出现拖动过程与松手结果不一致。

## 测试策略

- 为 group drag 计划增加 domain 测试，覆盖 window 内移动、跨 window 移动、拒绝 group into group。
- 为 `BrowserTabsApi.moveGroup()` 增加 adapter 测试。
- 为 selection drag 计划增加 view-order、跨 window 和加入 group 的测试。
- 继续运行现有 drag projection 测试，避免破坏单 tab drag。


## 2026-10-01：批量入组与连续请求的缺陷修复

现有 Selection Drag 要求将选中的 tabs 作为批次移动，但 Sortable 提交路径逐个调用分组和位置 API。操作日志又在每个调用前后读取快照，增加了每个 tab 之间的等待。修复后的执行层按目标 group 聚合 tab ids，保持投影顺序；同 window 使用 `groupTabs()`，跨 window 使用 `moveTabsToGroup()`，随后通过批量 `moveTabs()` 设置发生成员变化的 group 顺序。原生 group 整体拖动仍使用 `moveGroup()`。

一次拖拽包含分组、位置调整和焦点恢复多个步骤。仅对单个 API 调用排队，仍允许后续菜单请求在这些步骤之间执行。Manager 的 `BrowserTabsApi` 因此使用实例级串行队列，并通过 `runExclusive()` 将整次拖拽保留在同一执行边界内。回调使用专属 API 直接执行内部步骤，避免内部调用再次排队造成相互等待。日志包装位于队列内，使前后快照和记录也处于同一请求边界。

连续请求按提交顺序执行；后一条对同一批 tabs 的分组请求在前一条完成后生效。队列等待期间的快照读取也排队，避免刷新读取拖拽的中间状态。单条失败会拒绝其 Promise，但不会阻止后续请求执行。该队列作用于当前 Manager 实例，不是浏览器事务；不提供跨 Manager 页面、Popup、Codex bridge 或用户直接操作原生标签栏之间的全局互斥，也不承诺失败后的自动回滚。

回归测试使用可控 Promise 暂停第一次拖拽，在暂停期间发出第二次拖拽或菜单入组请求，验证后续请求等待整个拖拽完成，最终分组满足后一条请求，并验证日志快照不混入另一条请求。
