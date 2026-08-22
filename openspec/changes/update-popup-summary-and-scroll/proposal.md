## Why

The popup overview currently reports only focused-window counts, so users cannot compare the active window with the complete browser state. The current scroll containers also allow both the popup document and the content list to scroll, which produces two visible scrollbars.

## What Changes

- Show focused-window and all-window totals together in each summary metric.
- Display the installed extension version beside the popup title.
- Constrain scrolling to one content container and prevent document-level scrolling.
- Preserve the compact icon-led layout and existing navigation behavior.

## Impact

- Affected popup view-model and presentation styles.
- No new permissions or browser APIs are required.
