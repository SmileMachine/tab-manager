# Change: Refactor manager view synchronization for incremental DOM updates

## Why
The manager currently treats browser snapshots and sortable drag projections as whole-list state replacements. This preserves correctness, but it causes disruptive list remounts, Sortable lifecycle churn, and React DOM ownership conflicts when users manage hundreds of tabs.

## What Changes
- Introduce an explicit view patch model for browser snapshot synchronization.
- Confirm matching optimistic drag results without rebuilding the rendered list.
- Apply tab insert, remove, move, content, group metadata, and window changes through targeted view patches where possible.
- Refactor the window tab list to a single-parent row structure so moving tabs into or out of groups does not require cross-parent DOM ownership changes.
- Restrict full list replacement and forced remounts to documented exceptional paths.

## Impact
- Affected specs: manager-view-sync
- Affected code: `src/manager/hooks/useBrowserSnapshot.ts`, `src/manager/hooks/useSortableDragSync.ts`, `src/manager/view/browserSync.ts`, `src/manager/components/WindowSection.tsx`, `src/domain/windowRows.ts`
