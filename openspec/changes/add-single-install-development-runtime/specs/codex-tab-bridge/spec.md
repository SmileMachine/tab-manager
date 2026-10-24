## ADDED Requirements

### Requirement: Explicit opt-in for release native integration
The release extension SHALL connect to its optional Codex/MCP native host only after explicit user enablement, independently of local development control.

#### Scenario: Start with default or missing settings
- **WHEN** a release background starts without an explicitly enabled native integration setting
- **THEN** it SHALL NOT call the native host connection API or schedule connection retries
- **AND** absence of a saved setting SHALL mean disabled, including upgrades from an extension that previously attempted unconditional connections

#### Scenario: Enable local Codex/MCP integration
- **WHEN** a user explicitly enables the optional native integration
- **THEN** the extension SHALL persist the choice and attempt the authorized business bridge connection
- **AND** it SHALL explain the separate host installation and authorization prerequisite
- **AND** enabling the business bridge SHALL NOT enable development reload commands

#### Scenario: Disable local Codex/MCP integration
- **WHEN** a user disables a previously enabled native integration
- **THEN** the extension SHALL disconnect the native connection and cancel pending retries
- **AND** subsequent background restarts SHALL honor the disabled setting

### Requirement: Native integration failure isolation
Optional native integration failures SHALL NOT prevent normal extension initialization or core tab-management operations.

#### Scenario: Enabled integration has no usable host
- **WHEN** an opted-in connection fails because the host is missing, unauthorized, or disconnected
- **THEN** the extension SHALL report an understandable integration status
- **AND** connection recovery SHALL be controlled rather than an unconditional default one-second retry loop
- **AND** popup, manager, and native tab/group operations SHALL remain available

#### Scenario: Use core functionality with integration disabled
- **WHEN** a user manages tabs or groups with native integration disabled
- **THEN** those operations SHALL NOT activate a native connection or connection retry
- **AND** they SHALL NOT require a successful Codex/MCP connection
