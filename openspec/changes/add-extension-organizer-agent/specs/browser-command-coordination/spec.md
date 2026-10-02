## ADDED Requirements

### Requirement: Shared extension mutation coordinator
All extension-originated browser mutations SHALL pass through one background command coordinator across Manager pages, Popup, Agent, Codex writes, imports, and rollback. The coordinator SHALL accept explicit serializable commands rather than callbacks or arbitrary scripts and SHALL preserve existing action behavior and operation-journal semantics.

#### Scenario: Agent and another Manager page modify the same tabs
- **GIVEN** one page has submitted an approved Agent organization batch
- **WHEN** another page submits a conflicting manual drag or grouping request
- **THEN** the commands SHALL NOT interleave their browser-write steps
- **AND** commands SHALL execute in coordinator acceptance order subject to execution-time validity checks

#### Scenario: Popup, bridge, or recovery request arrives during a drag
- **GIVEN** a compound drag is executing
- **WHEN** Popup, Codex, import, or rollback submits a mutation
- **THEN** the later mutation SHALL wait for the complete drag command boundary
- **AND** the earlier command SHALL include its grouping, order, focus, and journal steps in that boundary

### Requirement: Execution-time validation and isolated reads
Validation of current browser state, user authorization, and idempotency SHALL happen within the command execution boundary after queue waiting and before the first write. Nested command steps SHALL use a scoped execution context without re-enqueueing themselves. Refresh queries SHALL wait for a completed boundary or return an explicit executing state rather than presenting an intermediate layout as completed.

#### Scenario: State changes while waiting
- **GIVEN** a command carries a reviewed browser revision
- **WHEN** a previously queued command changes the browser state before it starts
- **THEN** its revision check SHALL use the actual state at execution
- **AND** the command SHALL revalidate each dependent operation against the current state
- **AND** an operation with missing tabs, groups, or windows SHALL be skipped while unrelated operations continue
- **AND** a revision mismatch alone SHALL not make the entire command invalid

#### Scenario: Internal command composition
- **WHEN** a compound command invokes several browser primitives
- **THEN** those primitives SHALL execute in its existing scoped context
- **AND** the command SHALL NOT deadlock by waiting on entries it placed behind itself

### Requirement: Explicit partial failure and interruption
The coordinator SHALL record completed operations and steps, preserve failure information, and continue processing later requests after a failed command. Persisted in-progress commands SHALL be marked interrupted after worker restart until their actual browser outcomes are reconciled. Unknown write outcomes SHALL NOT be automatically replayed or represented as exactly-once execution.

#### Scenario: One step fails
- **WHEN** a command fails after completing some browser writes
- **THEN** the result SHALL identify success and failure separately using actual browser state
- **AND** subsequent queued commands SHALL remain eligible to execute
- **AND** the coordinator SHALL NOT silently roll back the whole workspace or retry the whole batch

#### Scenario: Service worker restarts mid-command
- **GIVEN** persisted command progress does not prove whether the last browser write completed
- **WHEN** the background worker starts again
- **THEN** the command SHALL be marked interrupted and reconciled against actual browser state
- **AND** further application of that plan SHALL require a new preview and confirmation rather than blind replay

#### Scenario: Duplicate confirmed submission
- **WHEN** the same valid task, plan hash, and confirmation are submitted more than once
- **THEN** the coordinator SHALL return the existing queued, in-progress, or completed command result
- **AND** it SHALL NOT start a second browser mutation batch

### Requirement: Native browser state remains authoritative
The coordinator SHALL not claim browser transaction atomicity or prevent user actions in the native tab strip. Agent commands SHALL check relevant state between steps when possible, stop remaining unsafe steps on detected conflicts, and expose a separate previewed recovery action rather than promise complete restoration of page-local state.

#### Scenario: Native tab manipulation conflicts with application
- **WHEN** a relevant tab or group is moved or removed through the native browser UI during execution
- **THEN** the executor SHALL detect the changed preconditions where observable and stop unsafe remaining steps
- **AND** it SHALL report actual partial outcomes rather than overwrite the conflict silently or report unconditional success
