## ADDED Requirements

### Requirement: Local Codex clients can inspect a versioned browser snapshot
The extension MUST expose a versioned local protocol that returns windows, tabs, native tab groups, browser ordering, grouping metadata, and a snapshot revision suitable for stale-state detection. The protocol MUST distinguish unavailable optional fields from empty values.

#### Scenario: Codex requests grouping context
- **WHEN** a local Codex client requests the full snapshot
- **THEN** the response includes windows, tabs, groups, native ordering, group membership, URL-derived grouping fields, capture metadata, and a revision
- **AND** the response identifies optional fields that the browser did not provide

#### Scenario: Codex requests only a subset of a large browser state
- **WHEN** a local Codex client requests tabs filtered by window, group, text, hostname, or lifecycle state
- **THEN** the response preserves native order within each window
- **AND** the response can use a documented field set without changing the meaning of returned identifiers

### Requirement: Local Codex clients can apply guarded tab and group operations
The extension MUST expose typed write operations for creating, updating, activating, moving, grouping, ungrouping, discarding, and closing tabs and native tab groups. Write operations MUST support dry-run validation and stale-state protection.

#### Scenario: Codex groups tabs after inspecting a snapshot
- **WHEN** the client submits a valid operation with a matching expected snapshot revision
- **THEN** the extension applies the operation through the browser API adapter
- **AND** returns per-operation results and the refreshed browser revision

#### Scenario: Codex submits an operation based on stale state
- **WHEN** the expected snapshot revision does not match the current revision
- **THEN** the extension rejects the write before mutating browser state
- **AND** returns a typed stale-state error with the current revision

#### Scenario: Codex previews a destructive operation
- **WHEN** the client requests a dry run for closing tabs or replacing an imported workspace
- **THEN** the extension returns the affected objects, warnings, and required confirmation fields
- **AND** the browser state remains unchanged

### Requirement: The bridge supports portable workspace import and export
The extension MUST export a portable workspace document containing enough information to recreate windows, tabs, native groups, order, pinned state, and selected activation state without depending on old browser IDs. Import MUST provide a preview and MUST default to appending new objects without closing existing tabs.

#### Scenario: Codex exports the current workspace
- **WHEN** the client calls the workspace export tool
- **THEN** the response contains a versioned document with stable import identifiers and native group metadata
- **AND** the document does not claim that old browser IDs are reusable

#### Scenario: Codex imports a workspace in append mode
- **WHEN** the client confirms a valid append import
- **THEN** the extension creates the required tabs and groups, restores supported ordering and pinned state, and returns old-to-new identifier mappings
- **AND** existing tabs remain open

### Requirement: The local bridge does not expose browser control to arbitrary web pages
The bridge MUST restrict browser-control requests to the configured local transport and MUST route browser mutations through the extension service worker and adapter boundary. The protocol MUST provide typed errors for unavailable permissions, invalid identifiers, unsupported browser features, and partial batch failures.

#### Scenario: An untrusted page attempts to invoke a write method
- **WHEN** an arbitrary web page sends a message to the extension
- **THEN** the extension does not execute the browser-control request
- **AND** no tab or group state changes

#### Scenario: A batch operation partially fails
- **WHEN** one operation in a batch fails after earlier operations have succeeded
- **THEN** the response identifies each operation's outcome and states that rollback was not performed
- **AND** the extension returns a fresh snapshot or revision for reconciliation
