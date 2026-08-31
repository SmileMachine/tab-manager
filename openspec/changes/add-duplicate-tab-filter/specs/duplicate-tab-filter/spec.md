## ADDED Requirements

### Requirement: Duplicate tab detection is strategy-based

The manager MUST expose duplicate detection through composable strategies. A strategy MUST be able to return no match key for a tab, and tabs sharing the same non-empty key within one strategy MUST be considered duplicates. Results from multiple strategies MUST be combined with OR semantics.

#### Scenario: URL strategy detects duplicates across windows

- **WHEN** two or more tabs have the same non-empty trimmed URL, including when they belong to different windows
- **THEN** all of those tabs are included in the duplicate tab ID set

#### Scenario: Title strategy detects duplicates

- **WHEN** two or more tabs have the same non-empty trimmed title
- **THEN** all of those tabs are included in the duplicate tab ID set

#### Scenario: Empty values do not form a duplicate set

- **WHEN** a tab has an empty or whitespace-only URL or title
- **THEN** that value does not participate in duplicate detection

### Requirement: Manager can filter to duplicate tabs

The manager MUST provide a toggle control in the filter toolbar that shows only tabs included in the duplicate tab ID set when enabled. The duplicate filter MUST compose with search, window, group status, pinned status, and group filters, while preserving native tab order and group rendering.

#### Scenario: Toggle shows duplicate tabs

- **WHEN** the user enables the `Duplicates` toggle
- **THEN** the manager displays only tabs that match at least one configured duplicate strategy

#### Scenario: Toggle is composable with other filters

- **WHEN** the duplicate toggle is enabled together with another tab filter
- **THEN** only tabs satisfying both the duplicate condition and the other filter are displayed

#### Scenario: Toggle can be disabled without mutation

- **WHEN** the user disables the `Duplicates` toggle
- **THEN** the manager restores the other active filters and does not select, close, move, or otherwise mutate any tab
