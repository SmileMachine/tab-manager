## Why

Users need a focused way to locate repeated tabs among a large browser session without changing or closing tabs. The manager already has a toolbar for search and tab filters, but it cannot express duplicate relationships.

## What Changes

- Add a `Duplicates` toggle to the manager filter toolbar.
- When enabled, show only tabs that belong to a duplicate set; keep the existing search, window, group, and pinned filters composable with it.
- Introduce an extensible duplicate-detection strategy interface.
- Provide the initial strategies that match non-empty tab URLs or non-empty tab titles exactly after trimming surrounding whitespace.
- Expose the same duplicate detection as the read-only MCP tool `tab_group.find_duplicate_tabs`.
- Keep duplicate detection read-only: it only changes the rendered view and does not select, close, move, or mutate tabs.

## Impact

- Affected manager filtering and toolbar UI.
- Affected domain-level view-model filtering logic and unit tests.
- Affected the Codex RPC read-method registry and the Node MCP tool registry.
- No browser permissions, persistence schema, or command API changes.
