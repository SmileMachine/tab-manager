## Why

The manager's two-pane layout currently treats the sidebar and the main workspace as part of one scrolling surface. This makes navigation move away with large workspaces, leaves no way to allocate more or less horizontal space to navigation, and makes the existing collapse affordance incomplete as a durable layout control.

## What Changes

- Give the sidebar and the main workspace independent vertical scroll containers within a viewport-sized manager shell.
- Add a draggable, keyboard-accessible divider for resizing the sidebar within bounded minimum and maximum widths.
- Preserve and complete sidebar collapse and expansion, including a compact collapsed rail and compatible resize behavior.
- Keep Current, named snapshots, history snapshots, and comparison views inside the same shell and preserve their existing content boundaries.
- Keep the adjustable width session-local; persistence of layout dimensions is out of scope for this change.

## Impact

- Updates the shared `WorkspaceShell` layout contract and manager layout state.
- Adds layout interaction tests for independent scrolling, resizing, and collapsing.
- Does not change browser tab behavior, snapshot data, operation history, or browser permissions.
