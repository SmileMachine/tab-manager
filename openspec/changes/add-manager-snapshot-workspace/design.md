# Manager 快照工作区设计

## 1. 目标与范围

本次变更把已经存在于 Codex bridge 中的快照、checkpoint、导入、导出和回退能力带到 manager。主界面需要让用户区分两种版本来源：用户主动保存的命名快照，以及由操作日志引用的操作历史快照。

本次只实现浏览和使用能力，不处理历史清理、保留天数、数量上限或存储容量设置。现有 IndexedDB 数据结构继续使用，避免在 UI 变更中同时改变持久化格式。

## 2. 快照分层

### 2.1 命名快照

命名快照由 `checkpoints` 记录表示，并通过 `snapshotId` 指向 `snapshots` 中的 portable workspace。用户点击“保存当前快照”时，manager 读取当前 `BrowserSnapshot` 并创建 checkpoint。

当用户没有输入名称时，使用当前本地时间生成默认名称，格式精确到秒，例如：

```text
2026-09-03 02:33:33
```

默认名称必须具有人类可读性；如果同一秒内保存多个状态，名称生成逻辑需要避免 UI 中出现无法区分的重复名称，例如增加短序号，但不改变快照内容和 `snapshotId`。

命名快照列表显示：名称、创建时间、revision、窗口数、tab 数、分组数，以及是否与当前状态一致。点击条目进入快照详情。命名快照条目支持沿用 manager 的右键菜单进行改名和删除；详情标题在 hover 时显示现有的铅笔图标，点击后进入行内编辑。

### 2.2 操作历史快照

操作历史列表来自 `operations`，不直接把 `snapshots` 中的每条记录平铺成用户版本。每条操作显示：操作时间、来源、操作类型、状态、影响 tab/group 摘要，以及 `beforeSnapshotId` 和 `afterSnapshotId`。

操作历史详情可以选择操作前或操作后状态作为一个可浏览、可比较、可打开 tab 的快照视图。操作历史快照没有独立的用户名称，显示为操作时间加操作类型，例如：

```text
2026-09-02 18:33:33 · closeTabs · before
```

历史列表需要明确标记“操作前”和“操作后”，避免用户误以为关闭 tab 后保存的操作后快照仍包含已关闭 tab。

### 2.3 命名快照管理

改名只更新 `checkpoints` 记录中的 `name`，不改变快照内容和 `snapshotId`。删除只删除命名 checkpoint 记录，不删除操作历史，也不立即清理可能仍被其他记录引用的 workspace snapshot。删除前必须要求用户确认。右键菜单复用现有 `selection-context-menu` 和 `context-menu-item` 样式，危险操作使用现有 danger 样式；详情标题旁的铅笔复用现有 `Pencil` 图标和 `icon-button` 样式。

## 3. Manager 信息架构

快照工作区需要把 `Current`、命名快照和操作历史快照视为同级的工作区来源。来源选择与工作区内容显示分开管理：左侧或顶部负责选择来源，主内容区域只渲染当前选中的一个工作区。

### 3.1 单工作区视图

工作区来源至少包括：

1. **Current**：读取当前浏览器状态，允许现有 Manager 的浏览器操作。
2. **Named snapshot**：读取用户选中的命名快照，以只读方式显示。
3. **Operation history snapshot**：读取操作前或操作后的快照，以只读方式显示。

选中 Snapshot 时，主内容区域不再同时显示 Current。Snapshot 必须使用与 Current 相同的窗口、分组和 tab 渲染器，只替换输入数据和操作能力。这样可以让用户在相同的空间结构中理解实时状态与历史状态，并避免维护两套相似的列表布局。

建议的组件边界如下：

- `WorkspaceSourceSwitcher`：管理 Current、named snapshot 和 history snapshot 的来源选择；
- `WorkspaceView`：接收统一的 workspace view model 和只读/可写能力配置；
- `WindowSection`、`GroupSummaryRow`、`TabListRow`：继续负责窗口、分组和 tab 的层级呈现；
- `SnapshotWorkspaceController`：负责快照加载、选择、导入导出、恢复和比较，不把快照数据访问逻辑放入展示组件。

快照中的 tab 选择属于当前快照视图，不修改浏览器中的 Manager 选择状态。快照视图中的写操作只允许调用明确的快照操作，例如打开选中的 tab、恢复整个工作区和导出。

### 3.2 比较视图

比较模式是第三种独立来源视图。它暂时使用左右两栏同时显示两个输入：左侧是 Snapshot，右侧是 Current。进入比较模式后，不再显示单工作区的 Current 或 Snapshot 主视图。

## 4. 打开快照中的 tab

快照详情以窗口、原生分组和 tab 顺序展示 tab。用户可以选择一个或多个 tab，然后执行“打开选中标签页”：

- 在当前聚焦的浏览器窗口中创建新的 tab；
- 使用快照中的 `url`，没有 `url` 时使用 `pendingUrl`；
- 保留 `pinned` 状态；
- 不关闭或复用当前已经存在的 tab；
- 不要求恢复快照中的原生 group；
- 新 tab 默认不抢占当前活动 tab，操作完成后刷新当前快照。

如果用户希望恢复整个工作区，使用独立的“恢复整个快照”操作，调用现有 rollback 语义，并要求明确确认。整体恢复可能创建窗口、创建 tab、恢复分组和关闭额外 tab，界面必须先显示预览和影响范围。

## 5. 导入与导出

### 5.1 导出

导出使用现有 `PortableWorkspace` 格式。命名快照详情导出所选快照；操作历史详情导出当前选择的 before/after 快照；也保留导出当前实时工作区的入口。

文件名使用快照名称或时间戳，并使用 `.json` 后缀。导出只读浏览器状态，不写入操作历史。

### 5.2 导入

导入通过文件选择器读取 JSON，先执行现有 workspace 校验和预览，再由用户确认。默认模式为 `append`，在现有窗口中追加或创建必要的窗口、tab 和 group；`replace` 作为明确的高影响选项展示，并要求更强的确认提示。

导入结果需要显示：创建的窗口、tab、group 数量、跳过项和 warning，并在成功后刷新 manager。导入仍然写入现有 operation journal，来源为 `import`。

## 6. 比较模型

增加独立的 portable workspace 比较模块，不在 React 组件中直接遍历快照。输入为一个 portable workspace 和当前 `BrowserSnapshot` 转换得到的 portable workspace，输出稳定排序的差异集合和摘要。

### 6.1 Tab 匹配

跨浏览器会话不能使用 native tab ID 匹配。匹配顺序如下：

1. 相同的非空 `url` 精确匹配；
2. URL 无法匹配时，使用相同的非空 `title`；
3. 同一 key 对应多个候选时，按标题、固定状态、分组、窗口和位置进行确定性选择；duplicate 是合法状态，不单独报告为异常。

URL 和标题匹配均只做 trim 后的精确比较，不做大小写折叠、重定向推断或站点语义判断。

### 6.2 差异类别

比较结果至少包含：

- `snapshot-only`：快照中有、当前没有；
- `current-only`：当前有、快照中没有；
- `changed`：匹配成功且至少一个被选中的比较字段发生变化；
- `unchanged`：匹配成功，但被选中的比较字段没有变化；
- duplicate 信息：显示匹配依据和 duplicate group 数量，不作为异常类别。

变化判定字段包括 URL、title、pinned、窗口、分组和位置。默认启用 URL、title、pinned、窗口和分组，默认不启用位置。URL 和 title 仍然用于 tab 匹配，用户取消字段只影响是否计为 `changed`，不改变匹配顺序。窗口和原生分组差异需要单独汇总：新增、删除、名称变化、颜色变化，以及 tab 的窗口或 group 变化。不把 native ID 作为跨快照身份。

### 6.3 比较 UI

比较视图采用 Git 风格的左右 diff：左栏显示 Snapshot，右栏显示 Current。两栏使用统一的窗口、分组和 tab 组件，但由比较投影提供行的配对、占位和差异标记。

默认只显示 `snapshot-only`、`current-only` 和 `changed` 内容，隐藏 `unchanged` tab 及其没有差异的上下文。窗口和分组标题仍可保留为路径上下文，避免用户无法判断差异属于哪个窗口或分组。用户可以通过 `Show unchanged` 显示完整配对结果。

- `snapshot-only`：左栏显示 tab，右栏显示空位；
- `current-only`：左栏显示空位，右栏显示 tab；
- `changed`：两栏显示配对 tab，并标注被选字段产生的变化；
- `unchanged`：默认隐藏，打开 `Show unchanged` 后显示；
- duplicate：显示 occurrence 配对和 duplicate 数量，不显示为错误。

变化判定复选框继续位于比较视图顶部。比较状态、字段选择和 `Show unchanged` 都属于当前比较会话，不写入浏览器和快照数据。用户可以从左栏的 Snapshot tab 选择并执行“打开快照 tab”，但比较模式本身保持只读。

## 7. 应用层与接口边界

优先复用现有 `OperationJournal`、`PortableWorkspace`、导入和回退模型。新增 manager application service 负责：

- 读取命名快照及其内容；
- 读取操作历史并解析 before/after snapshot；
- 创建 checkpoint；
- 将快照转换为导出 JSON；
- 通过现有浏览器 API 创建选中的 tab；
- 组织导入预览、确认和回退预览；
- 调用比较领域模块。

React 组件只负责状态和呈现，不直接操作 IndexedDB，也不在组件中实现比较算法。创建 tab 和整体恢复必须继续经过浏览器适配层与操作记录层，避免 manager 侧出现未记录的写操作。

## 8. 测试边界

覆盖以下测试：

- 默认时间戳名称精确到秒，并能处理同秒重复名称；
- 命名快照列表和操作历史 before/after 解析；
- 单个和多个快照 tab 的创建参数、当前窗口选择、URL fallback 和 pinned 状态；
- 导入预览、append/replace 确认和结果刷新；
- portable workspace 的 URL、title、duplicate、窗口、group、顺序和可选字段变化比较；
- Manager 组件中的同级 Current/Snapshot 视图、只读快照渲染、tab 选择、命名快照管理和无障碍状态；
- 比较视图的左右栏、默认隐藏 unchanged、空位配对、字段筛选和 Show unchanged 切换；
- 现有 `npm test`、TypeScript/WXT build 和 OpenSpec 严格校验。

不测试或实现历史清理、自动保留策略、存储容量限制和定时 prune。
