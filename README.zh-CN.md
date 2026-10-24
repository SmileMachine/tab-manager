# Tab Group Manager

[English README](README.md)

Tab Group Manager 是一个面向 Chrome 和 Microsoft Edge 的浏览器扩展，适合经常打开大量标签页、并且使用浏览器原生标签组的用户。

它提供一个独立的管理页面，让你可以在更大的空间里查看窗口、搜索标签页、移动标签页和整理标签组，不必只依赖浏览器顶部的标签栏。

## 安装

### 从 GitHub Releases 安装

1. 打开项目的 **Releases** 页面。
2. 下载最新的 `tab-group-v*.zip` 文件。
3. 将它解压到一个你会长期保留的文件夹。
4. 打开浏览器扩展管理页。
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
5. 开启 **Developer mode**。
6. 选择 **Load unpacked**。
7. 选择刚才解压得到的文件夹。

安装后，点击扩展图标，再选择 **Open manager**。

用这种方式安装时，请保留解压后的文件夹。浏览器会从这个文件夹加载扩展。

### 从源码构建

如果你想自己构建扩展，可以使用这一方式。

```bash
npm install
npm run build
```

然后在 `chrome://extensions` 或 `edge://extensions` 中使用 **Load unpacked**，选择 WXT 生成的 `.output/edge-mv3/` 文件夹。若要构建 Chrome 目标，运行 `npm run build:chrome`，然后选择 `.output/chrome-mv3/`。

## 可以做什么

### 整理标签页和标签组

- 拖动标签页到其他标签组、移出标签组、跨窗口移动，或改变顺序。
- 在同一窗口内或跨窗口移动整个标签组。
- 多选标签页后创建标签组、移动到已有标签组、释放内存、移出标签组或关闭标签页。
- 重命名标签组，并修改标签组颜色。

### 同时查看多个窗口

- 查看当前窗口、全部窗口，或某一个指定窗口的标签页。
- 在管理页面中给浏览器窗口命名，方便识别大型浏览会话。
- 折叠窗口和标签组，只保留摘要信息。

### 更快找到目标标签页

- 按标题、URL 或域名搜索标签页。
- 按已分组、未分组、已固定、未固定或指定标签组筛选。

### 调整管理页面视图

- 在详细视图和简洁视图之间切换。
- 选择适合阅读的宽度或全宽布局。

## 权限说明

Tab Group Manager 会请求以下浏览器权限：

- `tabs`：读取标签页标题、URL、图标、窗口 ID 和标签页状态；在你操作时移动、激活、释放内存或关闭标签页。
- `tabGroups`：读取、重命名、重新着色和移动浏览器原生标签组。
- `storage`：保存管理页面偏好，例如行密度、内容宽度、折叠状态、窗口名称和筛选条件。
- `favicon`：在管理页面中显示标签页图标。

扩展不会请求 `<all_urls>` 这类广泛站点权限，也不会向任意网站注入脚本。

## 浏览器支持

主要支持：

- Google Chrome
- Microsoft Edge

其他 Chromium 浏览器如果支持同样的 `tabs` 和 `tabGroups` 扩展 API，也可能可以使用。

## 开发者

运行测试：

```bash
npm run test
```

构建扩展：

```bash
npm run build
npm run build:chrome
```

### 单安装目录开发（保留热更新）

本地开发复用已安装并授权的 Native Messaging host，普通发行用户**不需要**安装 host。首次升级本地工作流：

```bash
npm run prepare:local
```

保持加载 `.output/edge-mv3-dev/`，在 Edge 扩展管理页重新加载一次以升级后台和 host 协议。之后每次开发只需：

```bash
npm run dev
```

命令自动切换到开发资源，页面编辑继续 WXT/Vite HMR。正常按 `Ctrl+C` 后等待 `Standalone runtime confirmed`，同一份安装会恢复独立运行，不再依赖 dev 服务器。若强杀或断电，可在浏览器与 host 可用后运行 `npm run restore:local`。必需 host 不可用时明确报错，不自动退回轮询或手动重载。

Chrome 使用 `prepare:local:chrome`、`dev:chrome`、`restore:local:chrome`，固定加载 `.output/chrome-mv3-dev/`。当前开发控制通道以 macOS 为验证目标；Windows 开发工作流尚未验证。

host 安装、首次迁移、可选 Codex/MCP 开关及故障边界见 [本地连接说明](docs/codex-native-messaging.md)。模式切换会重启后台；需要长期保存的数据仍应写入 `chrome.storage`。真实 Edge/Chrome 自动切换与页面 HMR 的完整验收尚未完成。

普通发行包默认不连接 host 或重试；需要本地 Codex/MCP 时，在「扩展选项」主动启用并单独安装 host。该业务开关不会开放开发重载能力。

运行完整本地检查：

```bash
npm run check
```

需要加载生产构建时，请在浏览器扩展管理页选择 `.output/edge-mv3/` 或 `.output/chrome-mv3/`。

## 当前限制

- 这是面向 Chromium 原生标签组的初始版本。
- 第一版公开安装方式暂不包含浏览器商店发布。
- 搜索或筛选启用时不能拖动，因为可见列表不再代表完整的标签页顺序。
