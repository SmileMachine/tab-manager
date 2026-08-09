# Design: 将扩展构建体系迁移到 WXT

## 背景

当前项目以 Vite 的多入口构建生成 Manifest V3 扩展。`manager.html`、`popup.html` 和 `src/background/index.ts` 由 `vite.config.ts` 显式声明；manifest 则以静态文件形式复制到 `dist/`。这种模式可以生成可安装扩展，但开发者每次修改都要手动执行构建命令，并在浏览器扩展管理页刷新扩展。

WXT 在 Vite 之上提供面向浏览器扩展的入口约定、manifest 生成、浏览器目标和开发期重载。迁移应改变扩展外壳，而不改变标签快照、命令服务、React 组件、Chrome API adapter 或产品行为。

## 目标

- 用 WXT 统一管理 manifest、extension entrypoints 和 Chromium 开发构建。
- 让 `npm run dev` 启动 WXT 开发模式，并由 WXT 负责监听、重建和扩展刷新。
- 保持 Edge 为首要目标，同时保持 Chrome 兼容。
- 保留当前的权限集合、popup、manager 页面 URL 语义和 background 事件监听。
- 保持单元测试与类型检查可独立运行。

## 非目标

- 不改变标签组管理、搜索、拖拽、选择或偏好设置的产品行为。
- 不引入 content script、options page 或跨浏览器 API 抽象层。
- 不承诺 service worker 重启后保存内存态；Manifest V3 background 本身必须假定可被浏览器终止和重新创建。
- 不迁移到 Firefox，除非后续需求明确提出。

## 决策

### 采用 WXT 作为扩展外壳

WXT 成为 extension manifest、浏览器目标、开发服务器和生产打包的唯一入口。项目继续使用 React 与 TypeScript；现有业务源码保留在 `src/`，避免为了适配工具而改变既有模块边界。

WXT 负责生成浏览器可加载目录。文档将不再把固定的 `dist/` 作为未打包扩展目录，而是说明对应 Chromium target 的 WXT 输出路径。

### 以 WXT 入口目录承载浏览器页面

background、popup 和 manager 迁移到 WXT 识别的 entrypoint 目录。页面的 React mount 逻辑可以继续复用现有模块，或者仅移动薄入口层；选择以减少业务模块路径变化为优先。

manifest 中的 `action`、`background` 和权限由 WXT 配置声明。popup 打开 manager 时仍使用 `chrome.runtime.getURL`，以免依赖开发或生产路径的固定前缀。

### 开发和验证分离

`npm run dev` 提供本地迭代，`npm run build` 生成可发布的 Chromium 扩展，`npm run test` 保留 Vitest 单元测试。开发期页面可通过 HMR 或扩展刷新更新；background service worker 的代码变更会导致 worker 重启，因而仅适合无内存态依赖的现有实现。

## 备选方案

### 保留 Vite 并增加 watch 脚本

可以用 `vite build --watch` 自动生成文件，但浏览器仍需刷新未打包扩展，且 manifest、入口和浏览器输出目录仍由项目自行维护。它减少构建命令次数，无法提供目标中的扩展开发体验。

### 为现有 Vite 配置自行实现扩展重载

可以通过 WebSocket 和 Chrome extension reload API 编写自定义重载机制，但需要维护开发期代码、CSP 例外和 browser 生命周期。这些职责已经由 WXT 覆盖，不值得在项目早期自行维护。

## 风险与缓解措施

- WXT 的目录约定可能改变页面产物名称。通过在 Chrome 和 Edge 中手动加载生成目录，验证 popup、manager 和 background 事件。
- 依赖版本可能改变 Vite 配置接口。以 WXT 当前稳定版本的文档和其安装后的类型定义为准，并由类型检查验证。
- 开发期重载可能清除页面局部状态或重启 service worker。文档明确该行为；业务逻辑继续从浏览器快照和 `chrome.storage` 读取状态。
- 现有未完成的 manager 重构 change 可能同时修改 `src/`。本 change 只移动或引用入口层，避免触及 manager 业务模块。

## 迁移步骤

1. 安装 WXT 和 React 集成模块，建立 WXT 配置与浏览器脚本。
2. 将 manifest 与三个扩展入口转换为 WXT 约定，删除被替代的 Vite 扩展配置。
3. 更新 TypeScript、README 和中文 README 的构建与加载说明。
4. 运行测试、生产构建和 OpenSpec 校验；在 Edge、Chrome 手动验证核心扩展路径。

## 验证

- `npm run test` 通过。
- `npm run build` 生成可由 Edge 和 Chrome 作为未打包扩展加载的 Chromium 产物。
- `npm run dev` 可以启动 WXT 开发模式并监听源文件修改。
- popup 可以打开 manager；background 的标签页和标签组事件继续触发 manager 刷新。
- `openspec validate migrate-extension-build-to-wxt --strict` 通过。
