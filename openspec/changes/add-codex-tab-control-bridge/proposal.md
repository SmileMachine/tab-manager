# Change: Add a local Codex tab-control bridge

## Why
The extension already owns the browser-native tab and tab-group model, but its capabilities are currently available only to its manager page. A local Codex process needs a typed, local-only control surface that can inspect enough browser state to make grouping decisions and can apply tab, group, and import/export operations with explicit safety checks.

The bridge must preserve native Chromium semantics. It must not introduce a second persistent grouping database, and it must not make the manager UI the only place where mutations can be performed.

## What Changes
- Add a versioned, typed request/response protocol for local automation clients.
- Expose a rich browser snapshot containing windows, tabs, native groups, ordering, lifecycle state, URL-derived fields, and a snapshot revision/hash.
- Expose focused read tools for windows, tabs, groups, capabilities, and exportable workspace state.
- Expose write tools for tab activation, tab creation/update/close/discard, reordering and cross-window movement, group creation/update/movement/ungrouping, and batch organization.
- Add dry-run, confirmation, expected-revision, and destructive-operation safeguards to write requests.
- Persist an operation journal with before/after portable snapshots for every extension and Codex mutation, and expose previewable rollback operations.
- Expose bounded direct page-content inspection tools for grouping decisions, with compact extraction, focused snippets, hard response budgets, and explicit unsupported-page handling.
- Add import/export of a portable workspace document that restores URLs, order, pinned state, windows, and native group metadata without reusing stale browser IDs.
- Add a local bridge boundary suitable for a native messaging host and a Codex/MCP adapter; browser API access remains inside the extension service worker.
- Add protocol, validation, browser-adapter, and command-layer tests, plus local setup and security documentation.

## Impact
- Affected capability: `codex-tab-bridge`
- Affected code:
  - service worker request routing and browser event handling
  - browser API adapter and snapshot model
  - command planning and batch execution
  - import/export serialization and operation snapshot journal
  - bounded page-content extraction and optional host-permission handling
  - local native-messaging/MCP adapter boundary
  - extension manifest and developer documentation
- No custom group membership database is introduced. Native tab groups remain the source of truth.
