# Change: Add popup active-tab group assignment

## Why

The popup can navigate to a group, but it cannot move the currently active tab into a selected native group. Users need a compact action that supports both groups in the focused window and groups in other browser windows without turning the main navigation list into a cross-window directory.

## What Changes

- Add an icon-led popup action that opens a compact picker for moving the active tab.
- List focused-window groups first and expose groups in other windows through a secondary section.
- Move the active tab into a selected native group, including cross-window movement when required.
- Keep the existing group-row behavior unchanged: clicking a group row still navigates to that group.
- Refresh the popup snapshot after a successful move and preserve accessible names, tooltips, focus states, and concise empty/error states.

## Impact

- Affected capability: `popup-quick-navigation`.
- Affected code: popup model and UI, browser tab/group adapter, and related tests.
- No new permissions are expected; existing `tabs`, `tabGroups`, and `windows` APIs are sufficient.
