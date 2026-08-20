## ADDED Requirements

### Requirement: Close selected tabs with keyboard shortcuts
The manager SHALL open the existing bulk-close confirmation dialog when the
user presses `Delete` or `Backspace` while one or more tabs are selected.

#### Scenario: Close a tab selection with Delete
- **WHEN** one or more tabs are selected and the user presses `Delete`
- **THEN** the manager opens the bulk-close confirmation dialog for the selected tabs

#### Scenario: Close a tab selection with Backspace
- **WHEN** one or more tabs are selected and the user presses `Backspace`
- **THEN** the manager opens the bulk-close confirmation dialog for the selected tabs

#### Scenario: Edit text while tabs are selected
- **WHEN** one or more tabs are selected and keyboard focus is in an input,
  textarea, select, or contenteditable element
- **THEN** the manager preserves the editable control's native key behavior
  without opening the bulk-close confirmation dialog

#### Scenario: A bulk-close confirmation is visible
- **WHEN** the bulk-close confirmation dialog is visible
- **THEN** the manager does not open an additional bulk-close confirmation in
  response to `Delete` or `Backspace`
