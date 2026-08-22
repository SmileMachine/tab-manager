## Why

The extension popup currently only opens the manager page. Users need a fast way to locate and switch to a tab without opening the full management surface, while keeping the popup compact and focused.

## What Changes

- Add a compact popup overview for the focused browser window.
- Add title, URL, and hostname search across all open tabs.
- Add one-click activation for search results, recent tabs, and current-window tab groups.
- Add concise icon-led controls with accessible names and native tooltips.
- Keep detailed organization actions in the manager page.

## Impact

- Affected entrypoint: `entrypoints/popup`.
- Affected popup presentation and view-model code under `src/popup`.
- No new browser permission is required.
- Existing `BrowserTabsApi` snapshot and activation capabilities are reused.
