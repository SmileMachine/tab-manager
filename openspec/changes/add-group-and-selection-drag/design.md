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
