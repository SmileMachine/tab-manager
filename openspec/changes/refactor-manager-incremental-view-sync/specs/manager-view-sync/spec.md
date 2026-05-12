## ADDED Requirements

### Requirement: Incremental Browser View Synchronization
The manager SHALL interpret browser snapshot updates as typed view patches before applying them to the rendered manager view.

#### Scenario: Browser snapshot confirms an optimistic drag
- **GIVEN** the manager has applied an optimistic drag projection
- **WHEN** a browser-sync snapshot returns the same tab order, window placement, and group membership as the optimistic projection
- **THEN** the manager SHALL confirm the optimistic operation
- **AND** the manager SHALL NOT replace or remount the rendered tab list for that confirmation

#### Scenario: Browser snapshot contains only tab content changes
- **GIVEN** the browser-sync snapshot has the same tab order, window placement, and group membership as the current manager view
- **WHEN** one or more tabs have changed title, URL, favicon, active state, audible state, or pinned state
- **THEN** the manager SHALL apply a content patch for the changed tabs
- **AND** unchanged tab rows SHALL preserve their existing view identity where possible

#### Scenario: Browser snapshot contains newly opened tabs
- **GIVEN** the browser-sync snapshot contains tab ids that are not present in the current manager view
- **WHEN** the new tabs can be mapped to a known window, index, and group membership
- **THEN** the manager SHALL apply an insert-tabs patch
- **AND** unaffected windows and tab rows SHALL not be replaced

#### Scenario: Browser snapshot contains closed tabs
- **GIVEN** the current manager view contains tab ids that are absent from the browser-sync snapshot
- **WHEN** the remaining tabs can be mapped to known windows, indices, and group membership
- **THEN** the manager SHALL apply a remove-tabs patch
- **AND** unaffected windows and tab rows SHALL not be replaced

#### Scenario: Browser snapshot contains tab movement
- **GIVEN** the browser-sync snapshot contains the same tab ids as the current manager view
- **WHEN** one or more tabs changed order, window placement, or group membership
- **THEN** the manager SHALL apply a move-tabs patch
- **AND** the manager SHALL avoid a full rendered list replacement when the movement can be mapped by tab id

#### Scenario: Browser snapshot cannot be classified safely
- **GIVEN** a browser-sync snapshot differs from the current manager view
- **WHEN** the manager cannot classify the difference into a safe view patch
- **THEN** the manager MAY apply a full replace patch
- **AND** the replace patch SHALL record a debug reason

### Requirement: Single-Parent Window Tab List
The manager SHALL render each browser window's sortable tab rows under one parent list so cross-group tab movement does not require moving tab DOM nodes between nested sortable parents.

#### Scenario: Expanded group renders as contiguous rows
- **GIVEN** a native tab group is expanded in the manager UI
- **WHEN** the window is rendered
- **THEN** every tab row in that group SHALL be a direct row in the window sortable list
- **AND** the group rail, label, and background SHALL be derived from the group's span metadata

#### Scenario: Collapsed group renders as one summary row
- **GIVEN** a native tab group with more than one tab is collapsed in the manager UI
- **WHEN** the window is rendered
- **THEN** the group SHALL render as one direct summary row in the window sortable list
- **AND** the manager SHALL retain enough hidden state to preserve the group's tab ids for drag and sync calculations

#### Scenario: Single-tab group is not treated as collapsible
- **GIVEN** a native tab group contains exactly one tab
- **WHEN** the group id exists in the manager collapsed group state
- **THEN** the manager SHALL still render the tab as an expanded direct row
- **AND** the manager SHALL NOT render an unreachable collapsed summary for that group

### Requirement: Forced Remounts Are Exceptional
The manager SHALL restrict forced window list remounts to exceptional recovery paths.

#### Scenario: Normal drag confirmation avoids remount
- **GIVEN** the user completes a sortable drag
- **WHEN** the browser-sync snapshot confirms the optimistic projection
- **THEN** the manager SHALL NOT increment a render-version key or otherwise force a full window list remount

#### Scenario: Recovery may remount with a reason
- **GIVEN** a browser operation fails, a sortable commit becomes stale, or a browser-sync patch cannot be classified safely
- **WHEN** the manager uses a forced remount to recover consistency
- **THEN** the manager SHALL log the recovery reason
- **AND** the remount SHALL be limited to the affected window list where feasible
