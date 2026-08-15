# Change: Add middle-click tab closing

## Why
Users managing large tab collections need a fast pointer gesture for closing an
individual tab without first selecting it or moving to the close button.

## What Changes
- Close an individual tab when the user middle-clicks its row content.
- Reuse the existing single-tab close action and snapshot refresh behavior.
- Preserve left-click selection, favicon activation, context-menu handling,
  dragging, and the explicit close button behavior.

## Impact
- Affected specs: `tab-management`
- Affected code: `src/manager/components/TabListRow.tsx`, component interaction
  tests, and existing tab close action tests where needed.
