## MODIFIED Requirements

### Requirement: Current-window group navigation

The popup SHALL list native groups in the focused window with group color and tab count, SHALL activate a representative tab when the user chooses a group, and SHALL preserve this navigation behavior when move controls are available.

#### Scenario: Activate group with move action present

- **GIVEN** the focused window contains a native group and the popup exposes an active-tab move action
- **WHEN** the user chooses the group row rather than the move action
- **THEN** the extension activates the group's active tab, or its first tab when no group tab is active
- **AND** the group row does not move the active tab

## ADDED Requirements

### Requirement: Move the active tab into a native group

The popup SHALL provide an icon-led action that opens a compact picker for moving the active tab into an existing native group.

#### Scenario: Open the group picker

- **GIVEN** the focused browser window has an active tab
- **WHEN** the user activates the move-current-tab control
- **THEN** the popup opens a compact group picker
- **AND** groups in the focused window appear before groups in other windows

#### Scenario: Move within the focused window

- **GIVEN** the active tab and selected target group belong to the same window
- **WHEN** the user chooses the target group
- **THEN** the extension adds the active tab to that native group
- **AND** refreshes the popup snapshot after success

#### Scenario: Move across windows

- **GIVEN** the active tab and selected target group belong to different windows
- **WHEN** the user chooses the target group
- **THEN** the extension moves the active tab to the target window and adds it to the target native group
- **AND** refreshes the popup snapshot after success

#### Scenario: Current group is selected

- **GIVEN** the active tab already belongs to a listed target group
- **WHEN** the group picker is opened
- **THEN** that group is marked as the current group and cannot be selected for a redundant move

#### Scenario: Move operation fails

- **GIVEN** the target group is unavailable or the browser rejects the move
- **WHEN** the extension attempts the move
- **THEN** the picker remains available
- **AND** the popup shows a concise failure state
- **AND** the extension requests a fresh browser snapshot

### Requirement: Accessible compact move controls

The popup SHALL provide an accessible name, native tooltip, visible focus state, and keyboard dismissal behavior for the move control and group picker.

#### Scenario: Keyboard dismissal

- **GIVEN** the group picker is open
- **WHEN** the user presses `Escape`
- **THEN** the picker closes and focus returns to the move control
