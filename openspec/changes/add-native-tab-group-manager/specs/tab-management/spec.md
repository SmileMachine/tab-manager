## ADDED Requirements

### Requirement: Dedicated Manager Page
The extension SHALL provide a dedicated manager page as the primary interface
for managing tabs and native tab groups.

#### Scenario: Opening the manager from the popup
- **GIVEN** the extension is installed
- **WHEN** the user opens the extension popup and chooses to open the manager
- **THEN** the extension opens the dedicated manager page

### Requirement: Native Tab Group Semantics
The extension SHALL use browser-native tab groups and SHALL NOT maintain a
separate custom group membership model.

#### Scenario: Creating a group from selected tabs
- **GIVEN** the user has selected one or more tabs from the same window
- **WHEN** the user creates a group
- **THEN** the extension creates a native browser tab group from those selected tabs

#### Scenario: Empty group creation is unavailable
- **GIVEN** no tabs are selected
- **WHEN** the user views group creation controls
- **THEN** the extension does not offer an empty group creation action

### Requirement: All-Window Snapshot
The extension SHALL read all browser windows, tabs, and native tab groups into a
snapshot model.

#### Scenario: Manager loads browser state
- **GIVEN** multiple browser windows are open
- **WHEN** the manager page loads
- **THEN** the manager has state for every accessible browser window, tab, and native tab group

### Requirement: Native Order Rendering
The manager SHALL render tabs in native tab index order within each browser
window.

#### Scenario: Grouped and ungrouped tabs are interleaved
- **GIVEN** a window contains grouped and ungrouped tabs in an interleaved order
- **WHEN** the manager renders that window
- **THEN** tabs appear in the same order as the browser tab strip
- **AND** ungrouped tabs remain in their native positions

### Requirement: Group Span Presentation
The manager SHALL present native tab groups as visual spans inside the native tab
order.

#### Scenario: Grouped tab range is visible
- **GIVEN** a native group contains adjacent tabs
- **WHEN** the manager renders the containing window
- **THEN** those tabs use a subtle background based on the native group color
- **AND** the group label appears in the left group column

#### Scenario: Manager group collapse does not affect browser collapse
- **GIVEN** a native group is visible in the manager
- **WHEN** the user collapses or expands that group inside the manager
- **THEN** the manager changes only its own view state
- **AND** the extension does not update the native browser group's collapsed state

### Requirement: Group Label Controls
The manager SHALL provide a group label with selection and view controls.

#### Scenario: Selecting a group
- **GIVEN** a group label is visible
- **WHEN** the user checks the group label checkbox
- **THEN** all tabs in that group become selected

#### Scenario: Partial group selection
- **GIVEN** only some tabs in a group are selected
- **WHEN** the manager renders the group label checkbox
- **THEN** the checkbox displays a mixed state

#### Scenario: Collapsed group summary
- **GIVEN** a group is expanded in the manager
- **WHEN** the user collapses the group label
- **THEN** the manager replaces the tab rows with a single summary row
- **AND** the summary includes the group name, tab count, color marker, and representative domains

### Requirement: Search and Structural Filters
The manager SHALL support unified search and basic structural filters.

#### Scenario: Searching tabs
- **GIVEN** the manager has loaded tabs
- **WHEN** the user searches by title, URL, or domain
- **THEN** matching tabs remain visible
- **AND** window structure and native tab order are preserved

#### Scenario: Filtering by structure
- **GIVEN** the manager has loaded tabs
- **WHEN** the user applies window scope, group status, pinned status, or group filters
- **THEN** only tabs matching those filters remain visible

### Requirement: Selection Preservation Across Refresh
The manager SHALL preserve selection for tabs that still exist after a snapshot
refresh.

#### Scenario: Selected tab survives refresh
- **GIVEN** a tab is selected
- **WHEN** the manager refreshes its browser snapshot and the tab still exists
- **THEN** the tab remains selected

#### Scenario: Selected tab is closed externally
- **GIVEN** a tab is selected
- **WHEN** that tab is closed outside the manager and the manager refreshes
- **THEN** the tab is removed from the selection

### Requirement: Create Group From Same-Window Selection
The manager SHALL allow native group creation only when selected tabs belong to
one browser window.

#### Scenario: Same-window selection can create group
- **GIVEN** all selected tabs belong to one window
- **WHEN** the user chooses create group
- **THEN** the extension creates a native tab group in that window from the selected tabs

#### Scenario: Cross-window selection cannot create group
- **GIVEN** selected tabs belong to multiple windows
- **WHEN** the user views create group controls
- **THEN** the create group action is unavailable
- **AND** the manager explains that native group creation requires a single window selection

### Requirement: Move Tabs To Existing Group Across Windows
The manager SHALL allow selected tabs to move to an existing native group,
including when selected tabs originate from other windows.

#### Scenario: Moving selected tabs to target group
- **GIVEN** tabs are selected
- **AND** an existing target group is available
- **WHEN** the user moves selected tabs to the target group
- **THEN** the extension moves the selected tabs into the target group
- **AND** selected tabs from other windows move to the target group's window

#### Scenario: Relative order is planned before move
- **GIVEN** selected tabs originate from one or more windows
- **WHEN** the manager plans the move command
- **THEN** selected tabs are ordered by manager window display order
- **AND** selected tabs from the same window are ordered by native tab index

### Requirement: Group Editing
The manager SHALL allow native groups to be renamed, recolored, and cleared of
selected tabs.

#### Scenario: Renaming a group
- **GIVEN** a native group is visible
- **WHEN** the user changes the group name
- **THEN** the extension updates the native group title

#### Scenario: Changing a group color
- **GIVEN** a native group is visible
- **WHEN** the user changes the group color
- **THEN** the extension updates the native group color

#### Scenario: Removing selected tabs from groups
- **GIVEN** selected tabs belong to one or more groups
- **WHEN** the user removes selected tabs from groups
- **THEN** those tabs become ungrouped in their current windows

### Requirement: Closing Tabs
The manager SHALL support direct single-tab close and confirmed bulk close.

#### Scenario: Closing one tab
- **GIVEN** a tab row is visible
- **WHEN** the user closes that single tab
- **THEN** the extension closes the tab without an additional confirmation

#### Scenario: Confirming bulk close
- **GIVEN** multiple tabs are selected
- **WHEN** the user chooses bulk close
- **THEN** the manager shows a confirmation with tab count, window count, pinned-tab presence, and example titles

#### Scenario: Browser state changes during bulk close confirmation
- **GIVEN** a bulk close confirmation is open
- **WHEN** browser tab state changes before the user confirms
- **THEN** the confirmation becomes invalid
- **AND** the user must review a refreshed confirmation before closing tabs

### Requirement: Automatic Synchronization
The manager SHALL automatically refresh its snapshot after browser tab, window,
or group changes.

#### Scenario: External browser change
- **GIVEN** the manager page is open
- **WHEN** a tab, window, or group changes outside the manager
- **THEN** the manager refreshes its snapshot after a short debounce

#### Scenario: Write command completes
- **GIVEN** the user performs a write command in the manager
- **WHEN** the command completes
- **THEN** the manager refreshes its snapshot and displays the browser's actual state

### Requirement: Stable Preference Persistence
The manager SHALL persist stable view preferences and SHALL NOT persist
transient work state.

#### Scenario: Saving view preferences
- **GIVEN** the user changes default window scope, group expand state, or density
- **WHEN** the manager stores preferences
- **THEN** those preferences are available when the manager is reopened

#### Scenario: Transient state is not restored
- **GIVEN** the user has active search text, selected tabs, scroll position, or an open dialog
- **WHEN** the manager is reopened later
- **THEN** those transient states are not restored
