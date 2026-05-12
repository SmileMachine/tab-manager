# Design: Manager Application Actions

## 背景

前一阶段已经把 `manager` 页面从单个大文件拆成 `components`、`hooks` 和 `view` 模块。这个拆分降低了文件复杂度，但 `App.tsx` 仍然承担应用动作编排：它调用 `BrowserTabsApi`，执行命令规划，刷新快照，清除选择，打开 group 编辑框，处理乐观更新和失败恢复。

接下来要增加 group 整体拖动和 selection 拖动。如果继续把新动作直接写入 `App.tsx`，拖拽功能会把现有动作编排进一步复杂化。因此需要建立 manager application actions。但这个重构不应作为一个长时间封闭阶段独立完成；它应与拖拽功能穿插推进。

## 目标

- 将非拖拽写操作逐步迁移到 `src/manager/application/`。
- 为每个动作提供以用户意图命名的接口，而不是让 UI 组件知道浏览器 API 调用顺序。
- 保留 `BrowserTabsApi` 作为浏览器 API seam。
- 保留 `domain/commands.ts` 中的命令规划函数，除非某个动作需要更深的计划模型。
- 让 group drag 和 selection drag 可以在相同 application 层中增加执行路径。

## 非目标

- 不在本 change 中一次性重写所有拖拽算法。
- 不引入外部状态管理库。
- 不改变浏览器真实状态作为来源的原则。
- 不改变现有 UI 行为、文案和视觉表现。

## 交错实现原则

本 change 与 `add-group-and-selection-drag` 应按依赖穿插实现：

1. 先迁移与拖拽无关的低风险 actions，例如 close、discard、update group。
2. 增加 `BrowserTabsApi.moveGroup()`，这是 group drag 的直接依赖。
3. 实现 group drag 的最小执行路径。
4. 再迁移 create group、move selected tabs to group、ungroup 等 selection 相关 actions。
5. 在此基础上实现 selection drag。

这意味着重构不是“先全部完成再做功能”，功能也不是“先绕过架构直接堆上去”。每一步只移动当下功能所需的 action seam。

## 模块形态

目标模块可以按动作族分组：

```text
src/manager/application/
  tabActions.ts
  groupActions.ts
  dragActions.ts
```

`tabActions.ts` 负责 close、discard、activate 等 tab 层动作。`groupActions.ts` 负责 create group、update group、move selected tabs to group、ungroup。`dragActions.ts` 负责 group drag 和后续 selection drag 的执行。

这些模块可以接受 `BrowserTabsApi`、当前 `BrowserSnapshotView` 和必要回调。第一阶段不强制引入复杂 result 类型，但错误处理、refresh 和 UI 后续动作必须集中在 action 函数附近，而不是分散到展示组件中。

## Interface 约束

Application action 的接口应体现用户意图。例如：

- `closeTabs(...)`
- `discardTabs(...)`
- `updateGroup(...)`
- `createGroupFromTabs(...)`
- `moveTabsToGroup(...)`
- `moveGroup(...)`

这些接口内部可以继续调用 domain planner，例如 `planCreateGroup()`、`planMoveToGroup()`。UI 层只负责传入当前状态和处理少量 UI callback，不应知道 API 调用细节。

## 测试策略

重构出的 action 若包含分支和浏览器 API 顺序，应使用 fake `BrowserTabsApi` 测试。优先覆盖：

- 禁用条件不会调用浏览器 API。
- 成功后按预期刷新。
- 成功后清除 selection 或打开 group 编辑框。
- 失败后保持现有错误行为。
- group drag 调用 `moveGroup()`，而不是展开成多个 tab 操作。

## 风险

主要风险是把 action 抽得过早、过深，导致接口比实现还复杂。判断标准是：如果一个函数只是把参数原样传给另一个函数，它还不是值得保留的 Module。只有当它集中表达浏览器 API 顺序、refresh、UI 后续动作或错误处理时，才有足够 Depth。
