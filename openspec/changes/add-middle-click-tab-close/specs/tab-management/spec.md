## ADDED Requirements

### Requirement: Middle-click single-tab close
The manager SHALL close the tab represented by a tab row when the user
middle-clicks the row content, then refresh the browser snapshot through the
existing single-tab close workflow.

#### Scenario: Middle-click an ungrouped tab row
- **WHEN** the user middle-clicks the content area of an ungrouped tab row
- **THEN** the manager closes only that tab and refreshes the displayed browser state

#### Scenario: Middle-click a grouped tab row
- **WHEN** the user middle-clicks the content area of a tab row within a native group
- **THEN** the manager closes only that tab and preserves the group's remaining tabs in native order

#### Scenario: Use another tab-row interaction
- **WHEN** the user left-clicks, right-clicks, drags, activates through the favicon, changes the selection checkbox, or presses the explicit close button
- **THEN** the manager preserves the existing interaction behavior without an additional middle-click close action
