## ADDED Requirements

### Requirement: Single-installation local development runtime
The local workflow SHALL use one browser-specific installation directory for development and standalone operation while preserving WXT/Vite page HMR.

#### Scenario: Enter development automatically
- **WHEN** the development server and complete development assets are ready and published
- **THEN** the workflow SHALL actively notify the target local extension through the native host to reload
- **AND** it SHALL NOT require a second installation or a manual reload on each development startup
- **AND** subsequent applicable page edits SHALL use WXT/Vite HMR rather than watched production builds

#### Scenario: Migrate an existing local installation
- **WHEN** an installation or running host does not yet implement the approved development control protocol
- **THEN** documentation SHALL describe the one-time upgrade and connection renewal
- **AND** it SHALL distinguish this migration from subsequent automatic development sessions

### Requirement: Restricted host-driven development control
The workflow SHALL reuse the existing native host for restricted local development notifications without exposing development switching as an ordinary Codex/MCP capability or using marker polling.

#### Scenario: Develop without a Codex MCP session
- **WHEN** the authorized local extension and native host are connected but no Codex MCP server is running
- **THEN** the development tool SHALL still be able to request a mode switch through its dedicated local control channel

#### Scenario: Reject unauthorized control
- **WHEN** a control request has invalid credentials, an unsupported protocol, an incorrect target, or originates from an ordinary unprivileged MCP request path
- **THEN** the workflow SHALL reject the request without reloading an extension
- **AND** control credentials SHALL NOT be committed or exposed through public manifests or logs

#### Scenario: Host is not ready
- **WHEN** host registration, protocol support, or the target connection is unavailable before development publication
- **THEN** the workflow SHALL report failure without replacing the usable standalone installation
- **AND** it SHALL NOT silently substitute polling, manual reload, or watched production builds

#### Scenario: Confirm a mode switch
- **WHEN** the workflow publishes assets and sends a reload request
- **THEN** it SHALL distinguish publication, request acceptance, and confirmation from the reloaded target background
- **AND** it SHALL NOT report a completed mode switch without matching session and runtime confirmation
- **AND** duplicate control messages SHALL NOT cause a reload loop

### Requirement: Graceful standalone restoration
The local workflow SHALL restore complete standalone assets before closing its development reload channel during graceful shutdown.

#### Scenario: Exit development normally
- **WHEN** a developer gracefully stops an active development session
- **THEN** the workflow SHALL stop competing development writes and publish validated standalone assets to the same installation directory
- **AND** it SHALL request and confirm an automatic target reload before reporting successful restoration
- **AND** the restored tab-management functionality SHALL NOT depend on development server availability

#### Scenario: Standalone rebuild fails
- **WHEN** a new standalone build fails during shutdown
- **THEN** the workflow SHALL restore the last validated standalone build rather than partial output
- **AND** it SHALL report that the restored build omits the failing changes

#### Scenario: Reload cannot be confirmed
- **WHEN** standalone assets have been restored but the reload request or completion confirmation fails
- **THEN** the workflow SHALL report the control failure separately from successful file restoration
- **AND** it SHALL NOT claim confirmed browser acceptance

### Requirement: Isolated and recoverable local output
The local workflow SHALL retain validated recovery assets separately from mutable development output and preserve normal release packaging.

#### Scenario: First standalone build fails
- **WHEN** no validated recovery build exists and the initial standalone build fails
- **THEN** the workflow SHALL fail without replacing the existing installation with partial output

#### Scenario: Recover after an ungraceful interruption
- **WHEN** a session terminates without shutdown cleanup
- **THEN** an explicit recovery command SHALL restore validated standalone assets and use the host to request a reload without starting the development server
- **AND** documentation SHALL NOT promise immediate automatic recovery at the moment of SIGKILL or power loss

#### Scenario: Concurrent sessions target the same installation
- **WHEN** another live workflow owns a browser-specific installation directory
- **THEN** a competing workflow SHALL refuse to mutate it

### Requirement: Release isolation from development control
Release extensions SHALL be self-contained for normal tab management and SHALL omit development switching capabilities regardless of optional business bridge settings.

#### Scenario: Build an Edge or Chrome release
- **WHEN** the normal production or release build runs
- **THEN** it SHALL preserve the existing release output locations and packaging
- **AND** generated extension assets SHALL NOT include the development control handler, automatic development host connection, or marker polling
- **AND** the change SHALL NOT add an alarms permission for mode switching

#### Scenario: Install without a native host
- **WHEN** an ordinary user installs the release extension without a native host, Node.js, or a development service
- **THEN** popup, manager, and core tab/group management SHALL remain usable
- **AND** ordinary installation instructions SHALL NOT require installing those local components
