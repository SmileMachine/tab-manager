# Design: Manager 增量视图同步

## 背景

当前 manager 的核心状态是 `BrowserSnapshotView`。浏览器同步和拖动结束都会产生一个新的完整 view，然后通过 `setSnapshotView()` 写回 React state。这个模型容易理解，也能保证最终正确，但它把许多本质上不同的事件都压成同一个动作：替换当前列表。

这在标签页数量很少时可以接受；在数百个标签页和频繁拖动的场景下，它会造成两个问题。第一，浏览器返回的同步信号如果只是确认了当前乐观排序，React 仍可能重新渲染或重建列表。第二，当前 group 内 tab 的 DOM 是嵌套结构，Sortable 在拖动时会直接移动 DOM，React 随后又根据旧 fiber 树更新同一批 DOM，跨 group 移入移出时容易触发 DOM 所有权冲突。

本 change 的目标是把同步模型从“完整 snapshot 替换”改为“明确 patch 应用”，并把窗口内 tab 列表改为单一父列表。这样排序、新开标签页、关闭标签页、标题 URL 变化、group 元信息变化等场景都可以按最小必要变更更新。

## 目标

- 让浏览器同步信号先被解释为 `BrowserViewPatch`，再应用到当前 `BrowserSnapshotView`。
- 让成功的乐观拖动在浏览器返回相同 layout 时被确认，而不是再次更新列表。
- 让新开 tab、关闭 tab、tab 内容变化、group 元信息变化、window 增删等常见场景产生局部 patch。
- 将 `WindowSection` 的右侧 tab 行改为同一父列表，group 只作为行的视觉和语义 span，而不是嵌套 DOM 容器。
- 将 `sortableRenderVersion` 的使用缩小到异常恢复路径，常规拖动不依赖整棵窗口树重挂载。
- 保持浏览器真实状态仍然是最终来源。

## 非目标

- 不改变 native tab group 的产品语义。
- 不改变 manager 的搜索、筛选、选择和批量操作交互。
- 不在本 change 中实现新的 selection drag 产品能力。
- 不引入外部状态管理库。
- 不把 browser snapshot 读取改成事件流 API；仍然可以读取完整 snapshot，但应用时必须先做差异解释。

## 核心决策

### Decision: 引入 `BrowserViewPatch`

新增一个 view 层 patch 模型，例如：

```ts
type BrowserViewPatch =
  | { kind: 'no-change' }
  | { kind: 'confirm-optimistic'; operationId: string }
  | { kind: 'content-update'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'insert-tabs'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'remove-tabs'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'move-tabs'; tabIds: NativeTabId[]; view: BrowserSnapshotView }
  | { kind: 'group-metadata-update'; groupIds: NativeGroupId[]; view: BrowserSnapshotView }
  | { kind: 'window-structure-update'; windowIds: NativeWindowId[]; view: BrowserSnapshotView }
  | { kind: 'replace'; reason: string; view: BrowserSnapshotView };
```

`view` 字段可以作为第一阶段的最小实现数据源，但 patch 的 `kind` 必须真实表达变化类型。后续可以把 `view` 进一步收窄为具体 payload。这样做的重点不是立即减少所有对象创建，而是先让同步决策有可测试的分类。

### Decision: 乐观拖动使用 operation id

拖动结束时生成 `operationId`，并把 projected view 记录为 expected layout。浏览器同步返回后：

- 如果 next snapshot layout 与 expected layout 一致，输出 `confirm-optimistic`，不写入新的 list state。
- 如果 layout 一致但 content 有差异，输出 `content-update`，只更新 tab 内容字段。
- 如果 layout 不一致，按差异分类输出 move/insert/remove/window patch；无法分类时才输出 `replace`。

这使排序动作的浏览器同步成为“确认”，不是“刷新”。

### Decision: 窗口内 tab DOM 扁平化

当前结构把 group 作为 `.sortable-root-item`，group 内 tab 又放入 `.sortable-group-tabs`。这让 tab 移入或移出 group 变成跨父节点 DOM 移动。为了减少 React 与 Sortable 同时持有 DOM 的冲突，窗口内所有 tab row 应处于同一个 sortable root 下。

group 左侧 rail、背景色、展开状态和 summary 行由 row model 计算并渲染，但 DOM 不再把 group 内 tabs 嵌套到另一个 sortable list。collapsed group 可以渲染为一个 summary row；expanded group 则渲染为连续 tab rows，每行带有 group span 信息。

### Decision: full replace 是异常路径

`replace` patch 只用于这些情况：

- window 结构变化过复杂，无法可靠映射旧 view 与新 view；
- 检测到当前乐观状态与浏览器返回状态冲突；
- Sortable 或浏览器 API 操作失败，需要恢复到浏览器真实状态；
- 数据缺失导致无法建立 tab id 或 window id 映射。

常规路径不得用 `replace` 处理排序、新开 tab、关闭 tab、内容变化和 group 元信息变化。

## 风险与取舍

- patch 模型比直接 `setSnapshotView(nextView)` 更复杂。收益是同步决策集中、测试面清晰，并能减少 DOM churn。
- 单一父列表会改变 `WindowSection` 的内部 DOM 结构。视觉必须保持一致，拖动行为要通过测试和手动验证确认。
- 第一阶段 patch 可能仍然以 `view` 作为应用数据源，但必须保持旧对象引用，避免无意义重渲染。后续可以继续缩小 patch payload。

## 测试策略

- 为 snapshot diff 增加纯函数测试，覆盖 confirm optimistic、content update、insert tabs、remove tabs、move tabs、group metadata update、window structure update 和 replace。
- 为 patch apply 增加引用稳定性测试，确认未变化的 window、tab item、group span 尽量保持引用。
- 为 `WindowSection` 的 row model 增加测试，确认 expanded group、collapsed group、single-tab group 和 ungrouped tabs 都能映射到单一父列表。
- 保留现有 sortable projection 和 sortable action 测试，确保拖动执行语义不变。
- 在 Edge 中手动验证：排序、移入 group、移出 group、新开 tab、关闭 tab、导航更新 URL/title/favicon、跨窗口移动 group。

## 迁移顺序

1. 先增加 patch diff 和 patch apply 纯函数，不接 UI。
2. 将 `useBrowserSnapshot` 改成通过 patch apply 更新 `snapshotView`。
3. 将乐观拖动接入 operation id 与 confirm optimistic。
4. 扁平化 `WindowSection` 的窗口内 tab DOM。
5. 移除常规路径上的 `sortableRenderVersion` 重挂载，只保留异常恢复路径。
