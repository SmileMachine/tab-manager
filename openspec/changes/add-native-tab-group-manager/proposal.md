# Change: Add native tab group manager

## Why
Users who keep hundreds of tabs open need a management surface larger than the
browser tab strip or extension popup. The extension should provide a dedicated
manager page for searching, selecting, grouping, moving, and closing tabs while
preserving native Edge and Chrome tab group semantics.

## What Changes
- Add a Manifest V3 extension architecture using React, TypeScript, and Vite.
- Add a dedicated manager page as the primary product surface.
- Add a lightweight popup that opens the manager page.
- Read all browser windows, tabs, and native tab groups into a snapshot model.
- Render each window in native tab order, with native groups shown as subtle
  spans in that order.
- Support search, basic structural filters, tab selection, group selection,
  native group creation from selected tabs, movement to existing groups,
  cross-window movement, group editing, tab removal from groups, single tab
  close, and confirmed bulk close.
- Add automatic synchronization by listening to browser state events and
  refreshing snapshots.
- Persist only stable view preferences, not transient search or selection state.

## Impact
- Affected specs: `tab-management`
- Affected code:
  - extension manifest and build configuration
  - manager page UI
  - popup entry point
  - service worker event bridge
  - browser API adapter
  - snapshot normalization and selection logic
  - command services for native tab and group operations

