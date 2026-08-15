# Change: Add selected-tab close keyboard shortcuts

## Why
Users who manage many tabs need a keyboard path for closing the current tab
selection without opening the selection context menu.

## What Changes
- Add `Delete` and `Backspace` shortcuts for closing selected tabs.
- Route both shortcuts through the existing bulk-close confirmation dialog.
- Keep the shortcuts inactive while focus is in an editable control or a
  bulk-close confirmation is already visible.

## Impact
- Affected specs: `tab-management`
- Affected code: `src/manager/App.tsx`, a new keyboard shortcut hook, and
  keyboard interaction tests.
