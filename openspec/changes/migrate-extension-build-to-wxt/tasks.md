## 1. 准备与依赖

- [ ] 1.1 记录当前测试与生产构建的基线结果。
- [ ] 1.2 安装 WXT 及其 React 集成模块，移除不再使用的 Vite 入口配置依赖。
- [ ] 1.3 建立 WXT 配置，保留当前 Manifest V3 权限和 Chromium 目标。

## 2. 扩展外壳迁移

- [ ] 2.1 将 background、popup 和 manager 转换为 WXT entrypoints。
- [ ] 2.2 将静态 manifest 配置迁移到 WXT 配置，并保留 action、background 与权限语义。
- [ ] 2.3 删除已被 WXT 取代的 Vite 构建文件和旧入口文件。
- [ ] 2.4 验证 popup 仍可通过 `chrome.runtime.getURL` 打开 manager 页面。

## 3. 开发者工作流

- [ ] 3.1 将 `dev`、`build` 和完整校验脚本调整为 WXT 工作流。
- [ ] 3.2 更新英文与中文 README，说明开发模式、生产构建和未打包扩展的加载目录。
- [ ] 3.3 记录 service worker 重启与页面状态刷新的开发期边界。

## 4. 验证

- [ ] 4.1 运行 `npm run test`。
- [ ] 4.2 运行 `npm run build`。
- [ ] 4.3 启动 `npm run dev`，确认 WXT 开发服务器能够启动。
- [ ] 4.4 在 Edge 和 Chrome 中手动验证 popup、manager 与 background 通知。
- [ ] 4.5 运行 `openspec validate migrate-extension-build-to-wxt --strict`。
