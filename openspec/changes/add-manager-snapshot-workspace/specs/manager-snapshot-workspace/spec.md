## ADDED Requirements

### Requirement: Manager separates named snapshots from operation history

The manager MUST present named snapshots and operation-history snapshots as separate sections. Named snapshots MUST be represented by checkpoints and operation-history entries MUST expose their before and after snapshot references without flattening all snapshot records into one undifferentiated list.

#### Scenario: Named snapshot list shows user-created versions

- **WHEN** the user opens the manager snapshot workspace
- **THEN** the named snapshot section lists checkpoints with their name, creation time, revision, and workspace summary

#### Scenario: Operation history exposes before and after states

- **WHEN** the user opens an operation-history entry
- **THEN** the manager allows the user to select the operation's before or after snapshot as the browsable state

### Requirement: Manager saves named snapshots with readable default names

The manager MUST allow the user to save the current browser workspace as a named snapshot. When no name is supplied, it MUST generate a human-readable local timestamp precise to seconds and MUST avoid presenting indistinguishable duplicate names created within the same second.

#### Scenario: Save current workspace with default timestamp name

- **WHEN** the user saves the current workspace without entering a name
- **THEN** the manager creates a checkpoint whose default name contains the local date and time precise to seconds

#### Scenario: Save current workspace with explicit name

- **WHEN** the user enters a non-empty name and saves the current workspace
- **THEN** the checkpoint keeps the supplied name and references the captured workspace snapshot

### Requirement: Manager manages named snapshot names and records

The manager MUST allow the user to rename or delete a named snapshot from a context menu that reuses the existing manager context-menu styling. The selected named snapshot detail MUST expose the same rename action through an existing pencil icon shown beside the name on hover or keyboard focus. Renaming MUST update only the checkpoint name. Deleting MUST require confirmation, delete only the named checkpoint record, and preserve operation-history records and the underlying workspace snapshot.

#### Scenario: Rename a named snapshot from the context menu

- **WHEN** the user chooses Rename for a named snapshot and saves a non-empty name
- **THEN** the manager updates the checkpoint name without changing its `snapshotId` or workspace contents

#### Scenario: Rename a named snapshot from the detail title

- **WHEN** the user hovers or focuses the selected named snapshot title and chooses the pencil action
- **THEN** the manager opens inline name editing for that checkpoint

#### Scenario: Delete a named snapshot

- **WHEN** the user chooses Delete for a named snapshot and confirms the action
- **THEN** the manager removes the named checkpoint from the named snapshot list
- **AND** operation history and the referenced workspace snapshot remain available

### Requirement: Manager opens selected tabs from a snapshot

The manager MUST allow the user to select one or more tabs from a named or operation-history snapshot and open them as new tabs in the current focused browser window. Opening selected tabs MUST preserve the snapshot URL or pending URL fallback and pinned state, MUST NOT close or reuse existing tabs, and MUST NOT require restoring the snapshot's native groups.

#### Scenario: Open one selected snapshot tab

- **WHEN** the user selects one tab from a snapshot and confirms opening it
- **THEN** the manager creates one new tab in the current focused window using the snapshot URL or pending URL

#### Scenario: Open multiple selected snapshot tabs

- **WHEN** the user selects multiple tabs from a snapshot and confirms opening them
- **THEN** the manager creates one new tab for each selected tab and preserves each selected tab's pinned state

#### Scenario: Opening selected tabs does not mutate existing tabs

- **WHEN** the user opens selected snapshot tabs
- **THEN** existing tabs remain open and existing matching URLs are not reused or closed

### Requirement: Manager imports and exports portable workspace snapshots

The manager MUST support importing and exporting the existing portable workspace JSON format. Import MUST show validation and an impact preview before changing browser state, default to append mode, and require explicit confirmation for state-changing import. Replace mode MUST be presented as a higher-impact option with explicit confirmation.

#### Scenario: Export a named snapshot

- **WHEN** the user exports a named snapshot
- **THEN** the manager downloads a JSON document representing that snapshot's portable workspace

#### Scenario: Preview and append-import a workspace

- **WHEN** the user selects a valid workspace JSON file and chooses append mode
- **THEN** the manager shows the import preview and changes browser state only after explicit confirmation

#### Scenario: Reject invalid workspace import

- **WHEN** the selected JSON file does not satisfy the workspace schema
- **THEN** the manager shows validation errors and does not create windows or tabs

### Requirement: Manager supports whole-snapshot restore with confirmation

The manager MUST expose whole-snapshot restore through the existing rollback semantics and MUST show a preview before applying a state-changing restore. The preview MUST identify possible tab, window, group, order, and extra-tab changes.

#### Scenario: Preview whole-snapshot restore

- **WHEN** the user requests restoration of a named or operation-history snapshot
- **THEN** the manager displays the planned changes and requires confirmation before applying them

#### Scenario: Cancel whole-snapshot restore

- **WHEN** the user cancels the restore confirmation
- **THEN** the browser state remains unchanged and no restore operation is recorded

### Requirement: Manager compares a snapshot with current browser state

The manager MUST provide a read-only comparison mode between a selected snapshot and the current browser workspace. Comparison MUST match tabs by exact non-empty trimmed URL first, then exact non-empty trimmed title. When a matching key has duplicate occurrences, the comparison MUST match occurrences deterministically and report the duplicate count as informational metadata rather than as an error.

#### Scenario: Report snapshot-only and current-only tabs

- **WHEN** a tab exists in the selected snapshot but not in the current workspace, or exists in the current workspace but not in the selected snapshot
- **THEN** the comparison reports the tab as `snapshot-only` or `current-only` respectively

#### Scenario: Report changed placement or metadata

- **WHEN** a snapshot tab matches a current tab and a selected comparison field differs
- **THEN** the comparison reports a `changed` entry with the relevant before and current values

#### Scenario: Configure fields counted as changed

- **WHEN** the user changes the comparison field checkboxes
- **THEN** URL, title, pinned state, window, group, and position differences are counted only when their corresponding field is selected, while snapshot-only and current-only entries remain unchanged
- **AND** position is unselected by default

#### Scenario: Match duplicate occurrences

- **WHEN** more than one snapshot tab or current tab shares the selected matching URL or title key
- **THEN** the comparison pairs available occurrences deterministically, reports the number of tabs in the duplicate group, and does not report `ambiguous` solely because the key is duplicated

#### Scenario: Comparison is read-only

- **WHEN** the user views or expands comparison results
- **THEN** the manager does not mutate browser tabs, windows, groups, or snapshots

### Requirement: Snapshot retention and cleanup remain outside this change

This change MUST NOT add automatic history cleanup, retention settings, or pruning behavior. Existing persistence and explicit cleanup interfaces MUST remain unchanged.

#### Scenario: Viewing snapshots does not prune history

- **WHEN** the user opens, compares, imports, exports, or restores a snapshot
- **THEN** the manager does not delete operation records, checkpoints, or snapshots as an implicit side effect
