# Change: Refactor manager modules without behavior changes

## Why
The manager page has grown into a single large React file that mixes rendering, browser synchronization, preferences, command execution, drag projection, overlay behavior, and local view helpers. This makes small interaction changes increasingly expensive and has already produced repeated Escape and drag-preview inconsistencies.

## What Changes
- Split the manager page into focused modules for page composition, window rendering, tab rows, group labels, context menus, dialogs, hooks, and view helpers.
- Preserve existing user-visible behavior while creating stable module boundaries for later application-layer and drag-model refactors.
- Move view-only helpers and overlay helpers out of `App.tsx` when they already have a clear interface.
- Keep browser APIs behind `BrowserTabsApi` and keep existing domain functions available for current tests.

## Impact
- Affected specs: `manager-architecture`
- Affected code: `src/manager/App.tsx`, `src/manager/components/*`, `src/manager/hooks/*`, `src/manager/view/*`
- No behavior change is intended in this phase.
