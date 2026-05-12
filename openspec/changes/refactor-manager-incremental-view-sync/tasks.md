## 1. Patch 模型

- [x] 1.1 新增 `BrowserViewPatch` 类型，定义 `no-change`、`confirm-optimistic`、`content-update`、`insert-tabs`、`remove-tabs`、`move-tabs`、`group-metadata-update`、`window-structure-update` 和 `replace`。
- [x] 1.2 新增 browser view diff 纯函数，输入 current view、next view、可选 expected optimistic view，输出 `BrowserViewPatch`。
- [x] 1.3 为 diff 函数补测试：相同状态输出 `no-change`，匹配乐观 view 输出 `confirm-optimistic`，只改 title/url/favicon 输出 `content-update`。
- [x] 1.4 为 diff 函数补测试：新开 tab 输出 `insert-tabs`，关闭 tab 输出 `remove-tabs`，排序输出 `move-tabs`。
- [x] 1.5 为 diff 函数补测试：只改 group title/color 输出 `group-metadata-update`，window 增删输出 `window-structure-update`，无法分类时输出 `replace`。

## 2. Patch 应用

- [x] 2.1 新增 patch apply 纯函数，输入 current view 与 `BrowserViewPatch`，输出 next view。
- [x] 2.2 保证 `no-change` 和 `confirm-optimistic` 返回当前 view 引用。
- [x] 2.3 保证 content update 只替换变化 tab 所在的必要对象，未变化 tab item 保持引用。
- [x] 2.4 保证 insert/remove/move patch 只替换受影响 window，未受影响 window 保持引用。
- [x] 2.5 为 patch apply 增加引用稳定性测试。

## 3. Browser Snapshot 接入

- [x] 3.1 修改 `useBrowserSnapshot`，browser sync 不再直接 `setSnapshotView(nextView)`，而是计算并应用 patch。
- [x] 3.2 保留 initial/manual refresh 的完整读取能力，但将 browser-sync 路径收敛到 patch apply。
- [x] 3.3 在 debug log 中输出 patch kind、受影响 tab/window/group 数量和是否触发 replace。
- [x] 3.4 确保 selection reconcile 只在 tab id 集合变化时运行，content-only 更新不重算 selection。
- [x] 3.5 运行现有 browser sync、snapshot、selection 测试，并补上 browser sync patch 路径测试。

## 4. 乐观拖动确认

- [x] 4.1 为 sortable drag session 增加 `operationId`，记录 expected optimistic layout。
- [x] 4.2 拖动结束时立即应用 projected view，并记录 expected view。
- [x] 4.3 浏览器同步返回 expected layout 时输出 `confirm-optimistic`，不更新 list state。
- [x] 4.4 浏览器同步返回 expected layout 但 content 不同时，只应用 content patch。
- [x] 4.5 stale reconcile 只影响对应 operation，不应打断新的 drag session。
- [x] 4.6 补充测试覆盖：成功排序确认不重建，pending browser sync 在拖动结束后被确认吸收。

## 5. WindowSection 单父列表

- [ ] 5.1 调整 window row/render block 模型，让 expanded group 内 tab row 与 ungrouped tab row 处于同一个 sortable root。
- [ ] 5.2 保留 group rail、group 背景色、左侧 group label、collapsed summary 的视觉语义。
- [ ] 5.3 移除 expanded group 内部 `.sortable-group-tabs` 作为 Sortable list 的职责。
- [ ] 5.4 更新 `useSortableWindowLists`，让常规 tab 拖动、group 拖动和 collapsed summary 都从单一父列表读取状态。
- [ ] 5.5 补测试覆盖 expanded group、collapsed group、single-tab group、ungrouped tabs 的 row/state 映射。

## 6. 限制强制重挂载

- [ ] 6.1 移除常规乐观拖动路径中的 `sortableRenderVersion` 递增。
- [ ] 6.2 仅在 conflict、browser operation failure、无法分类 patch 或 DOM/state 明确不一致时触发强制重挂载。
- [ ] 6.3 为强制重挂载路径增加 debug log，记录触发原因。
- [ ] 6.4 验证排序、新开 tab、关闭 tab、content update 不触发 Sortable effect cleanup/create。

## 7. 验证

- [ ] 7.1 运行 `npm run test -- src/manager/view/browserSync.test.ts src/manager/view/sortableWindow.test.ts src/manager/application/sortableActions.test.ts src/domain/windowRows.test.ts`。
- [ ] 7.2 运行 `npm run check`。
- [ ] 7.3 在 Edge 手动验证排序、移入 group、移出 group、新开 tab、关闭 tab、导航更新 URL/title/favicon、跨窗口移动 group。
- [ ] 7.4 对照 debug log 确认常规路径不再出现不必要的 `sortable effect cleanup/create`。
