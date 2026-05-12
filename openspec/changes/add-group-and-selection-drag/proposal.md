# Change: Add group and selection drag

## Why
The manager currently supports dragging individual tabs. Users also need to reorder native tab groups as a whole and move selected tabs as a batch. These interactions are central for managing hundreds of tabs efficiently.

## What Changes
- Add native group drag using `chrome.tabGroups.move()` through `BrowserTabsApi.moveGroup()`.
- Allow group drag only for reordering a whole group within a window or moving it to another normal window.
- Do not allow dragging a whole group into another group; moving all group tabs into another group remains a selection action.
- Add selection drag so selected tabs can move together while preserving view order as much as Chromium APIs allow.
- Implement this feature interleaved with `refactor-manager-application-actions`.

## Impact
- Affected specs: `tab-management`
- Affected code: `src/domain/commands.ts`, `src/domain/dragProjection.ts`, `src/infrastructure/browserTabsApi.ts`, `src/manager/application/*`, `src/manager/components/*`
- Depends on selected slices of `refactor-manager-application-actions`, especially `BrowserTabsApi.moveGroup()`.
