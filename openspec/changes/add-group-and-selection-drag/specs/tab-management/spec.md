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

#### Scenario: Submitting selected group members as a batch
- **GIVEN** multiple selected tabs are dropped into the same target group
- **WHEN** the manager commits the drag
- **THEN** the manager SHALL submit their group membership changes as one batch per target group in projected order
- **AND** same-window grouping SHALL NOT first move those tabs to the window end
- **AND** the target group's final tab order SHALL be applied with a batch move when supported

#### Scenario: A later manager request targets the same selected tabs
- **GIVEN** a drag commit is still updating browser state in one manager page
- **WHEN** a later drag or bulk grouping request is submitted in that page
- **THEN** the later request SHALL wait for all grouping, ordering, focus restoration, and journal writes in the earlier drag to finish
- **AND** the final group membership SHALL respect request submission order
- **AND** browser snapshot refreshes SHALL NOT read intermediate drag state

#### Scenario: A failed drag does not block later requests
- **GIVEN** an earlier drag commit fails
- **WHEN** a later bulk grouping request is waiting in the manager queue
- **THEN** the earlier request SHALL report its failure
- **AND** the later request SHALL still be executed

#### Scenario: Moving selected tabs out of a group
- **GIVEN** selected grouped tabs are dragged to an ungrouped target position
- **WHEN** the drop is completed
- **THEN** the selected tabs SHALL be moved to the target position
- **AND** the selected tabs SHALL be removed from their original group membership when the target semantics require ungrouping
