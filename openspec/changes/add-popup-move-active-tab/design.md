# Popup 当前标签页分组设计

## 交互目标

popup 需要提供一个高频、低干扰的“将当前标签页移动到 group”入口。现有 group 行已经承担跳转职责，因此保留行点击行为，不在每一行增加永久性的第二个动作入口。

顶部新增一个图标按钮，使用 `FolderInput` 或语义相近的移动图标，并提供以下可访问信息：

- `aria-label`: `Move current tab`
- `title` 与 `data-tooltip`: `Move current tab`

点击按钮后，在按钮附近显示一个紧凑的 group picker。picker 不改变 popup 的主滚动模型，内容过多时由 picker 自己使用同一个受控列表区域，避免新增文档级滚动条。

## Group picker 结构

```text
Move current tab

Current window
  [color] Work                 12
  [color] Reading               8

Other windows
  Window 2
    [color] Research             9
    [color] Archive               4
```

规则如下：

1. 当前 window 的 group 排在最前面，作为默认可见内容。
2. 其他 window 的 group 按 window 分组，并默认折叠或通过紧凑的二级区域展开。
3. 每个 group 显示颜色、标题和 tab 数量；标题为空时显示 `Untitled group`。
4. 当前标签页已经属于某个 group 时，该 group 显示选中状态并禁止重复移动。
5. group 数量较多时，picker 提供局部搜索；不复用主搜索框，避免改变主搜索的标签页语义。
6. 点击目标 group 后执行移动，成功后刷新 snapshot 并关闭 popup。
7. 移动失败时保留 picker，显示简短错误状态，并允许再次尝试。
8. `Escape` 关闭 picker，点击按钮再次点击也关闭 picker；打开 picker 时将焦点移入第一个可用目标。

## 跨 window 移动

浏览器状态仍以原生 `chrome.tabs`、`chrome.windows` 和 `chrome.tabGroups` 为来源。移动操作需要明确目标 group 的 `groupId` 与 `windowId`：

- 同一 window：将当前 active tab 加入目标 group。
- 不同 window：先将 tab 移动到目标 window，再将 tab 加入目标 group。
- 成功后刷新完整 snapshot，使当前窗口统计、全部窗口统计和 group 列表保持一致。

目标 group 的 tab 操作应通过浏览器 API adapter 暴露，React 组件不直接编排跨 window 的 API 调用。

## 视图模型

在现有 `PopupModel` 中增加当前 active tab 与移动候选 group 的明确数据结构，至少包括：

- active tab 的 `id`、`windowId`、标题和 favicon 元数据；
- group 的 `id`、`windowId`、标题、颜色和 tab 数量；
- window 的显示标签与 group 列表；
- 当前 tab 所属 group，用于禁用重复目标。

主 group 列表继续只展示当前 window 的导航候选；移动 picker 使用跨 window 候选数据，避免改变现有主列表的信息密度。

## 错误与边界

- 没有 active tab 时，移动按钮保持禁用，并提供 tooltip 说明。
- 没有任何可用 group 时，picker 显示简短的空状态，并保留打开 manager 的入口。
- 目标 group 在移动期间消失时，显示失败状态并重新读取 snapshot。
- 不创建新 group；创建 group 仍属于 manager 页面或其他明确入口的职责。
