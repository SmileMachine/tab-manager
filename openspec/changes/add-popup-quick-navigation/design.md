# Popup 快速导航设计

## 目标

popup 的单一职责是帮助用户快速定位和切换标签页。它不复制 manager 的批量整理界面，也不堆叠说明文本。每个可操作图标都提供 `aria-label` 和 `title`，视觉上优先使用图标、数字和标签组颜色表达状态。

## 信息结构

```text
┌ Tab Group Manager                         ↗ ┐
│  12 tabs      3 groups      2 ungrouped      │
│  [⌕ Search tabs...                    × ]    │
│                                              │
│  Current window                              │
│  ● Work                              6       │
│  ● Research                          9       │
│  ○ Ungrouped                          2      │
│                                              │
│  Recent                                      │
│  favicon  Tab title                    ↗     │
│  favicon  Tab title                    ↗     │
└──────────────────────────────────────────────┘
```

## 数据来源

- 通过现有 `createChromeBrowserTabsApi().loadSnapshot()` 获取窗口、标签页和原生标签组。
- focused window 作为 Current window；若没有 focused window，使用第一个 normal window。
- 搜索覆盖标题、URL 和 hostname，保持与 manager 的搜索语义一致。
- Recent 按 `lastAccessed` 降序排列，最多显示 5 项。
- 点击标签页或标签组时调用现有 `activateTab(tabId, windowId)`，不新增写入接口。

## 交互与可访问性

- popup 打开后搜索框自动获得焦点。
- `Escape` 清空搜索；清空按钮仅在有搜索内容时出现。
- 搜索、刷新、打开 manager、清空搜索等图标按钮必须提供可访问名称与 `title`。
- 标签页结果使用原生 `button`，整个行均可点击；键盘可通过 Tab 和 Enter 操作。
- Loading、error、empty 状态只显示必要信息，不加入冗长解释。
- 搜索结果和最近使用标签页最多展示 6 项，避免 popup 变成滚动型 manager。

## 不在本次范围

- 批量关闭、释放内存、自动分组和工作区恢复。
- 最近关闭标签页；该功能需要 `sessions` 权限和独立的数据模型。
- 持久化 popup 搜索词或临时选择状态。
