## ADDED Requirements

### Requirement: Native Group Drag
The manager SHALL allow users to drag a native tab group as a whole to reorder it within a window or move it to another normal window.

#### Scenario: Reordering a group within the same window
- **GIVEN** a window contains multiple native tab groups
- **WHEN** the user drags one group to a new position in the same window
- **THEN** the manager SHALL move the native group as a whole
- **AND** the manager SHALL preserve the tabs inside that group

#### Scenario: Moving a group to another window
- **GIVEN** two normal browser windows are visible in the manager
- **WHEN** the user drags a native group from one window to another
- **THEN** the manager SHALL move the native group to the target window
- **AND** the manager SHALL refresh from browser state after the operation

#### Scenario: Group cannot be dragged into another group
- **GIVEN** a user drags a native group over another native group
- **WHEN** the drop would mean merging the dragged group into the target group
- **THEN** the manager SHALL reject that drop interpretation
- **AND** moving all tabs from one group into another SHALL remain a selection action

### Requirement: Selection Drag
The manager SHALL allow users to drag selected tabs as a batch while preserving manager view order as much as Chromium APIs allow.

#### Scenario: Dragging a selected tab drags the selection
- **GIVEN** multiple tabs are selected
- **WHEN** the user starts dragging one of the selected tabs
- **THEN** the drag subject SHALL be the selected tab set
- **AND** the selected tabs SHALL be ordered by current manager view order

#### Scenario: Dragging an unselected tab remains single-tab drag
- **GIVEN** multiple tabs are selected
- **WHEN** the user starts dragging a tab that is not selected
- **THEN** the drag subject SHALL be only that tab
- **AND** existing single-tab drag behavior SHALL be preserved

#### Scenario: Moving selected tabs into a group
- **GIVEN** selected tabs are dragged to a target group position
- **WHEN** the drop is completed
- **THEN** the selected tabs SHALL move to the target window and group according to the drag plan
- **AND** the manager SHALL refresh from browser state after the operation

#### Scenario: Moving selected tabs out of a group
- **GIVEN** selected grouped tabs are dragged to an ungrouped target position
- **WHEN** the drop is completed
- **THEN** the selected tabs SHALL be moved to the target position
- **AND** the selected tabs SHALL be removed from their original group membership when the target semantics require ungrouping
