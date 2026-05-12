## ADDED Requirements

### Requirement: Manager Module Decomposition
The manager page SHALL be decomposed into focused modules for page composition, rendering components, hooks, and view helpers without changing user-visible behavior.

#### Scenario: Rendering components are moved out of App
- **GIVEN** the manager page renders windows, group labels, tab rows, menus, popovers, and dialogs
- **WHEN** the module refactor is complete
- **THEN** those rendering units SHALL live in focused component modules outside `src/manager/App.tsx`
- **AND** they SHALL preserve the existing DOM semantics and CSS class names unless a specific visual change is approved separately

#### Scenario: View helpers are pure
- **GIVEN** helper logic derives menu positions, group label placement, group options, favicon URLs, or serialized filter values
- **WHEN** the helper is moved out of `App.tsx`
- **THEN** it SHALL live in a view helper module with a small explicit interface
- **AND** it SHALL NOT call browser write APIs or React state setters

### Requirement: Behavior Preservation During Refactor
The refactor SHALL preserve existing manager behavior while creating module boundaries for later application-layer and drag-model refactors.

#### Scenario: Existing tests and build remain valid
- **GIVEN** the refactor moves code between manager modules
- **WHEN** verification is run
- **THEN** the existing unit tests and production build SHALL pass
- **AND** OpenSpec validation for this change SHALL pass in strict mode

#### Scenario: Future application refactor remains possible
- **GIVEN** command execution currently coordinates browser API calls, refreshes, optimistic updates, and UI state changes
- **WHEN** first-phase module decomposition is complete
- **THEN** command execution SHALL NOT be pushed into rendering components
- **AND** components SHALL communicate user intent through props callbacks rather than direct browser API calls

#### Scenario: Future drag refactor remains possible
- **GIVEN** drag behavior currently has separate planning and projection logic
- **WHEN** first-phase module decomposition is complete
- **THEN** existing drag planning and preview behavior SHALL be preserved
- **AND** the refactor SHALL NOT introduce additional independent drag-result calculations inside rendering components
