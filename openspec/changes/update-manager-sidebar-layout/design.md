# Manager 侧边栏布局调整设计

## 1. 目标

本次调整只处理 manager 的工作区外壳，不改变 Current、named snapshot、operation history snapshot 或 comparison 的数据和业务行为。目标是让左侧导航与右侧工作区成为两个独立的界面区域：各自拥有滚动上下文，侧边栏宽度可以调整，侧边栏可以收起并恢复。

## 2. 页面尺寸与滚动模型

`WorkspaceShell` 使用视口高度作为布局边界：

- 外层 shell 使用 `height: 100dvh`，并禁止页面级溢出；
- 左侧 `workspace-sidebar` 设置 `min-height: 0` 和独立的 `overflow-y: auto`；
- 右侧 `workspace-main` 设置 `min-height: 0`，内部采用标题工具栏与可滚动主内容的两行布局；
- `workspace-main-content` 成为右侧唯一的纵向滚动容器，并使用 `overscroll-behavior: contain`，避免滚动继续传递到页面或另一栏；
- 工具栏不再依赖视口滚动来保持位置，它位于右侧滚动内容之外，始终固定在右栏顶部。

这样，侧边栏列表变长时只滚动侧边栏；窗口、分组和标签页内容变长时只滚动右栏。移动端单栏布局仍保留，但在单栏模式下按照同一容器规则处理滚动，避免出现双重页面滚动。

## 3. 宽度调整

`WorkspaceShell` 接收当前侧边栏宽度和宽度变更回调，并通过 CSS custom property 控制 grid 第一列：

- 展开状态默认宽度为 `252px`；
- 可调范围为 `200px` 到 `420px`；
- 拖动区域位于侧边栏与右栏之间，使用较宽的交互命中区和细边界视觉，不改变主要内容边界；
- 拖动过程中对宽度进行 clamp，并暂时禁止文本选中，避免拖动长列表时产生选区；
- `pointermove` 通过 pointer capture 继续工作，即使指针离开分隔线也能完成一次连续调整；
- 收起状态固定为 `52px` 的 compact rail，拖动分隔线隐藏，恢复后回到最近一次展开宽度。

宽度只保存在当前 manager 页面会话中。没有用户明确要求时，不把临时布局尺寸写入 `chrome.storage` 或快照数据。

## 4. 收起与无障碍交互

保留现有收起按钮，并让它成为共享 shell 的正式控制：

- 展开状态显示 `Collapse workspace sidebar`；
- 收起状态显示 `Expand workspace sidebar`；
- 分隔线使用 `role="separator"`、`aria-orientation="vertical"`、`aria-valuemin`、`aria-valuemax` 和 `aria-valuenow`；
- 分隔线支持键盘操作：左右方向键按固定步长调整，`Home` 跳到最小宽度，`End` 跳到最大宽度；
- 收起按钮在侧边栏滚动时保持可用，不被长列表推离可视区域；
- 视觉反馈使用已有边框、颜色和 focus-visible 样式，不新增高频动画。

## 5. 组件边界

`WorkspaceShell` 负责布局、拖动分隔线、键盘调整和收起控制；`SnapshotWorkspace` 只持有 `sidebarWidth` 和 `sidebarCollapsed` 状态，并继续提供 sidebar、toolbar 与 children。这样 Current 和 Snapshot 不需要分别实现侧边栏行为，后续调整尺寸范围或交互规则时只修改一处。

## 6. 测试策略

增加组件测试覆盖：

- shell 渲染分隔线并提供正确的 ARIA 属性；
- pointer drag 更新侧边栏宽度并遵守最小、最大边界；
- keyboard resize 支持方向键、`Home` 和 `End`；
- 收起与展开切换保持统一的 class、按钮标签和最近展开宽度；
- Current 与 Snapshot 都使用同一 shell；
- CSS 静态检查确认外层禁止页面滚动、左右区域各自具备滚动上下文。

浏览器中的实际滚动、拖动手感和移动端单栏表现仍需在 Edge 中手动验证。
