## ADDED Requirements

### Requirement: Independent workspace scrolling

The manager SHALL keep the workspace sidebar and the main workspace in separate vertical scrolling containers inside a viewport-sized shell. Scrolling one region MUST NOT scroll the other region or rely on page-level scrolling for its normal content.

#### Scenario: Long snapshot navigation list

- **GIVEN** the snapshot navigation list is taller than the available sidebar height
- **WHEN** the user scrolls inside the sidebar
- **THEN** only the sidebar content scrolls
- **AND** the main workspace toolbar and content retain their current scroll positions

#### Scenario: Long workspace content

- **GIVEN** the Current or Snapshot workspace is taller than the available right-pane height
- **WHEN** the user scrolls inside the main workspace
- **THEN** only the main workspace content scrolls
- **AND** the sidebar retains its current scroll position

### Requirement: Adjustable sidebar width

The manager SHALL provide a bounded, draggable divider between the sidebar and the main workspace. The divider MUST expose its current value and limits through separator accessibility attributes and MUST support keyboard adjustment.

#### Scenario: Resize sidebar by pointer

- **GIVEN** the sidebar is expanded
- **WHEN** the user drags the divider horizontally
- **THEN** the sidebar width changes continuously within the configured minimum and maximum bounds
- **AND** the main workspace occupies the remaining width

#### Scenario: Resize sidebar by keyboard

- **GIVEN** the divider has keyboard focus
- **WHEN** the user presses a horizontal arrow key
- **THEN** the sidebar width changes by the configured keyboard step
- **AND** `aria-valuenow` reflects the new width

#### Scenario: Clamp sidebar width

- **GIVEN** the user drags or keyboard-adjusts beyond either width limit
- **WHEN** the adjustment is applied
- **THEN** the sidebar width remains at the corresponding limit
- **AND** the main workspace remains renderable

### Requirement: Collapsible sidebar

The manager SHALL allow the sidebar to be collapsed into a compact rail and expanded again without losing the last expanded width. The collapse control MUST remain available while the sidebar list is scrolled.

#### Scenario: Collapse expanded sidebar

- **GIVEN** the sidebar is expanded at any supported width
- **WHEN** the user activates the collapse control
- **THEN** the sidebar changes to the compact rail width
- **AND** the navigation content is hidden while the expand control remains available

#### Scenario: Restore sidebar

- **GIVEN** the sidebar is collapsed
- **WHEN** the user activates the expand control
- **THEN** the sidebar returns to its last expanded width
- **AND** the same Current, Name, or History selection remains active

### Requirement: Shared shell behavior

Current, named snapshot, operation-history snapshot, and comparison views SHALL use the same scrolling, resizing, and collapse behavior through the shared workspace shell.

#### Scenario: Switch workspace source

- **GIVEN** the user switches between Current and any snapshot source
- **WHEN** the right-pane view changes
- **THEN** the sidebar width, collapse state, and independent scroll structure remain governed by the same shell
- **AND** the selected source remains visible in the sidebar
