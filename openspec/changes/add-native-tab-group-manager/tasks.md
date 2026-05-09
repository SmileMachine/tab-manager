## 1. 扩展基础
- [x] 1.1 配置 Manifest V3、React、TypeScript 和 Vite 构建。
- [x] 1.2 新增管理页面入口。
- [x] 1.3 新增轻量 popup，用于打开管理页面。
- [x] 1.4 新增 service worker 骨架，用于转发浏览器状态事件。
- [x] 1.5 定义 tabs、tab groups、windows 和 storage 所需扩展权限。

## 2. 浏览器状态模型
- [x] 2.1 在 `chrome.tabs`、`chrome.windows` 和 `chrome.tabGroups` 外增加 `BrowserTabsApi` 适配层。
- [x] 2.2 实现所有窗口、tab 和 tab group 的完整快照读取。
- [x] 2.3 实现视图模型归并，保持原生窗口顺序和 tab index 顺序。
- [x] 2.4 将原生 group 表示为窗口有序 tab 列表中的区间。
- [x] 2.5 为快照归并和 group 区间生成增加单元测试。

## 3. 管理页面
- [x] 3.1 按浏览器原生顺序渲染窗口和 tab。
- [x] 3.2 用淡色背景渲染已分组 tab 区间。
- [x] 3.3 渲染左侧粘性 group 标签，包含 checkbox、名称、数量和展开图标。
- [x] 3.4 实现仅作用于管理页面的 group 展开/收起。
- [x] 3.5 实现收起后的 group 摘要行。
- [x] 3.6 支持紧凑和舒适两种视图密度。

## 4. 搜索、筛选与选择
- [x] 4.1 增加标题、URL 和域名的统一搜索。
- [x] 4.2 增加窗口范围、分组状态、固定状态和 group 筛选。
- [x] 4.3 筛选结果保持原生窗口顺序和 tab 顺序。
- [x] 4.4 实现基于 `tabId` 的 tab 选择模型。
- [x] 4.5 实现 group checkbox 的未选、半选和全选状态。
- [x] 4.6 为筛选和选择保留逻辑增加测试。

## 5. 命令
- [x] 5.1 用同一窗口内已选择的 tab 创建原生 group。
- [x] 5.2 将已选择的 tab 移动到已有 group，包含跨窗口移动。
- [x] 5.3 在浏览器 API 允许的范围内尽量保留已选 tab 的相对顺序。
- [x] 5.4 将已选择的 tab 移出 group。
- [x] 5.5 支持重命名 group 和修改 group 颜色。
- [x] 5.6 支持直接关闭单个 tab。
- [x] 5.7 批量关闭已选择 tab 前要求确认。
- [x] 5.8 写操作完成后刷新快照。
- [x] 5.9 为命令规划和关闭确认摘要增加测试。

## 6. 同步与偏好
- [x] 6.1 监听 tab、window 和 tab group 状态事件。
- [x] 6.2 对外部状态事件做 debounce，并重新读取快照。
- [x] 6.3 刷新后保留搜索、筛选、展开状态和仍然存在的选择。
- [x] 6.4 浏览器状态变化时使批量关闭确认失效。
- [x] 6.5 持久化默认窗口范围、group 展开状态和视图密度。

## 7. 验证
- [x] 7.1 运行 `openspec validate add-native-tab-group-manager --strict`。
- [ ] 7.2 在 Edge 中手动验证扩展。
- [ ] 7.3 在 Chrome 中手动验证基础兼容性。
- [ ] 7.4 使用数百个真实或生成的 tab 验证大列表行为。
