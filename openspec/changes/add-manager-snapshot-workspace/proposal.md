## Why

The manager can currently manipulate live tabs and the Codex bridge already persists portable snapshots, checkpoints, operation history, imports, exports, and rollback data. These capabilities are not discoverable or usable from the manager UI, so users cannot manage saved workspace versions, inspect historical states, open selected tabs from a snapshot, or understand how a snapshot differs from the current browser state.

## What Changes

- Add a manager snapshot workspace with separate sections for named snapshots and operation-history snapshots.
- Allow saving the current browser state as a named snapshot with a human-readable local timestamp, precise to seconds, as the default name.
- Allow browsing snapshot metadata and tab contents, selecting one or more tabs, and opening selected snapshot tabs as new tabs in the current focused window.
- Add JSON import and export for portable workspace snapshots, using the existing workspace schema and explicit confirmation for imports that change browser state.
- Surface whole-snapshot restore through the existing rollback behavior with explicit confirmation.
- Add peer Current and Snapshot workspace views that share the manager renderer, and a Git-style side-by-side comparison that shows only differences by default.
- Keep operation-history retention and cleanup out of scope for this change.

## Impact

- Adds manager UI, snapshot application services, portable-workspace comparison logic, and related tests.
- Reuses the existing IndexedDB operation journal and Codex snapshot/import/rollback domain models.
- Adds no browser permissions and does not change the existing snapshot persistence format.
- Does not add automatic cleanup, retention settings, or destructive history pruning UI.
