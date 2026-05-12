## ADDED Requirements

### Requirement: Manager Application Actions
The manager SHALL provide application action modules that coordinate browser write APIs, command planning, refresh behavior, optimistic updates, and UI follow-up state outside rendering components.

#### Scenario: Rendering components do not execute browser write actions
- **GIVEN** a user triggers close, discard, group update, group creation, tab movement, group movement, or drag completion from the manager UI
- **WHEN** the action is executed
- **THEN** rendering components SHALL call application action interfaces or top-level callbacks
- **AND** rendering components SHALL NOT directly call `BrowserTabsApi` write methods

#### Scenario: Application actions preserve browser refresh semantics
- **GIVEN** a write action modifies browser tab or group state
- **WHEN** the write action completes successfully
- **THEN** the manager SHALL refresh from browser state or apply the existing approved optimistic update followed by refresh

#### Scenario: Application action refactor is interleaved with drag feature work
- **GIVEN** group drag and selection drag are implemented in a separate feature change
- **WHEN** a drag feature requires a new browser write path
- **THEN** the supporting application action seam SHALL be introduced before or with that feature slice
- **AND** unrelated application actions MAY remain in `App.tsx` until their implementation slice is reached
