## ADDED Requirements

### Requirement: User-configured Responses connection
The extension SHALL let the user configure an HTTPS API root, API key, and model ID for an explicit OpenAI Responses-compatible model through `ai` and `@ai-sdk/openai`. It SHALL NOT require an external Codex process, Native Messaging host, or extension-operated model proxy.

#### Scenario: Explicit API root selection
- **WHEN** a user configures an endpoint
- **THEN** the extension SHALL reject embedded credentials, query strings, fragments, and a resource URL ending in `/responses`
- **AND** model requests SHALL target only the Responses resource beneath the validated root
- **AND** redirects SHALL be rejected rather than forwarding credentials to another destination

#### Scenario: User grants endpoint access
- **WHEN** the user explicitly requests connection validation or starts analysis
- **THEN** the extension SHALL request the minimum host permission expressible for the configured endpoint
- **AND** denied permission SHALL prevent the request without requesting access to all websites

### Requirement: Credential isolation
API keys SHALL default to session-only retention in trusted extension contexts. Device-local retention SHALL require explicit opt-in and SHALL be described as local plaintext storage rather than secure encryption. Credentials SHALL NOT enter synchronization storage, model context, task records, journals, exports, telemetry, or user-visible error details.

#### Scenario: Default and remembered keys
- **WHEN** a user supplies a key without enabling device-local retention
- **THEN** the key SHALL expire with the browser session
- **WHEN** the user explicitly enables device-local retention
- **THEN** the extension SHALL retain it only in trusted local extension storage and provide a deletion control

#### Scenario: Service configuration changes
- **WHEN** the API root changes
- **THEN** the previous key SHALL NOT be automatically sent to the new endpoint
- **AND** existing plans and confirmations SHALL be invalidated until a new configuration is explicitly bound

### Requirement: Non-destructive capability validation
The extension SHALL separate basic connection validation from Agent capability validation. Capability validation SHALL use synthetic inputs to verify a streaming function-call and function-result round trip without reading or mutating real browser tabs.

#### Scenario: Text works but tools do not
- **GIVEN** a configured service returns plain text successfully but cannot complete a function-call round trip
- **WHEN** capability validation runs
- **THEN** the extension SHALL report Agent incompatibility rather than considering basic connectivity sufficient
- **AND** Agent execution SHALL remain unavailable until required capabilities are validated

#### Scenario: Client-owned tool history
- **WHEN** the Agent continues after a tool result
- **THEN** the client SHALL provide matching function-call history and results without depending on `previous_response_id` or remote conversation persistence
- **AND** requests SHALL explicitly set `store: false`
- **AND** the UI SHALL NOT represent this flag as a guarantee of a third party's retention policy

### Requirement: Bounded user-selected metadata
The v1 Agent SHALL organize selected tabs by default and SHALL offer current-window scope only by explicit user choice. Each task SHALL freeze its allowed tab IDs, exclude private-window and non-HTTP(S) pages, and send only bounded title, sanitized URL, order, and group metadata to the configured service. It SHALL NOT read page bodies, form values, hidden content, all windows, or automatically expand an empty selection.

#### Scenario: Empty or excessive selection
- **WHEN** the selected scope is empty, exceeds 200 tabs, or exceeds 64 KiB of serialized metadata
- **THEN** the extension SHALL require the user to select or narrow the scope
- **AND** it SHALL NOT silently switch to all tabs or process only a truncated subset

#### Scenario: Metadata minimization
- **WHEN** metadata is sent for model analysis
- **THEN** URL user information, query strings, and fragments SHALL be excluded and title/path lengths SHALL be bounded
- **AND** the UI SHALL identify the configured destination and the categories of transmitted data
- **AND** task tool calls referencing out-of-scope tab IDs SHALL be rejected locally

#### Scenario: Untrusted tab text
- **GIVEN** a tab title or URL contains instructions to call tools or change permissions
- **WHEN** the Agent analyzes that metadata
- **THEN** those instructions SHALL NOT grant additional tools, expand scope, authorize writes, or choose a network destination

### Requirement: Proposal-only model tools
The Agent SHALL expose only scoped reads and a locally validated proposal tool. Its v1 proposals MAY create groups, assign scoped tabs to existing groups, and rename fully scoped affected groups within their current windows. Model tools SHALL NOT directly mutate tabs or sign user confirmation.

#### Scenario: A proposal requests writes
- **WHEN** the model proposes a grouping plan
- **THEN** the extension SHALL create an editable pending plan without browser mutation
- **AND** it SHALL validate IDs, group ownership, duplicate membership, allowed operation kinds, and scope
- **AND** it SHALL reject closing, discarding, URL changes, cross-window moves, imports, and rollback execution

#### Scenario: New groups and scoped renaming
- **WHEN** a plan creates a group
- **THEN** it SHALL use a plan-local reference resolved by the executor instead of a fabricated native group ID
- **WHEN** a plan renames an existing group
- **THEN** every tab affected by the rename SHALL belong to the task scope

### Requirement: Application-issued plan confirmation
Every Agent write SHALL require explicit user confirmation bound to the plan hash, task scope, reviewed browser revision, and configuration identity. Reviewable plans MAY be retained for up to 24 hours; confirmation SHALL be one-time and valid for at most five minutes. Model output and existing bridge `confirm` fields SHALL NOT themselves constitute user authorization.

#### Scenario: Editing a proposal
- **WHEN** the user removes or changes a grouping suggestion
- **THEN** the resulting plan SHALL be revalidated and assigned a new hash
- **AND** an earlier confirmation SHALL NOT authorize the edited plan

#### Scenario: Applying after state changes
- **GIVEN** a user confirmed a plan and it waited in the command queue
- **WHEN** the browser revision, relevant membership, group ownership, configuration identity, or authorization validity differs at actual execution
- **THEN** the extension SHALL reject the stale plan without starting its writes
- **AND** it SHALL request a new preview rather than silently updating the reviewed revision

### Requirement: Observable bounded task lifecycle
The Agent SHALL run model analysis in the Manager extension page, limit analysis to six model steps, apply a 60-second per-request and 120-second task timeout, disable automatic model retries, and support cancellation. Tasks SHALL expose analysis, pending confirmation, queued, applying, success, partial failure, failure, cancellation, and interruption states.

#### Scenario: Canceling analysis or a queued application
- **WHEN** the user cancels during analysis
- **THEN** the extension SHALL abort its transport and prevent subsequent tool execution
- **WHEN** a queued application is cancelled before its writes start
- **THEN** its authorization SHALL be withdrawn and no browser write SHALL begin

#### Scenario: Closing Manager or canceling an active application
- **WHEN** the Manager page closes during analysis
- **THEN** the page-owned analysis SHALL stop
- **WHEN** an approved operation has already been handed to the background executor
- **THEN** closing Manager SHALL NOT be described as undoing that operation
- **AND** an explicit cancel request SHALL be checked between steps without claiming to reverse completed writes

#### Scenario: Task data retention
- **WHEN** task state is persisted
- **THEN** the extension SHALL retain no more than 20 recent tasks or 24 hours of non-secret task data and SHALL provide a clear-history control
- **AND** API keys, raw user prompts, page bodies, and provider error bodies SHALL NOT be retained in task or operation records
- **AND** unavailable provider usage SHALL be presented as unknown, not fabricated cost

### Requirement: Locally packaged on-demand runtime
Executable Agent dependencies SHALL be packaged locally and loaded only when the Agent surface is opened. Automatic external tracing, telemetry, provider gateway routing, and execution of remotely supplied scripts SHALL be disabled.

#### Scenario: Ordinary tab management startup
- **WHEN** the user opens Manager without opening the Agent
- **THEN** the Agent runtime SHALL NOT be included in initial model-runtime loading
- **AND** ordinary tab management SHALL NOT require an API configuration or model request

#### Scenario: Provider returns executable-looking content
- **WHEN** a response contains JavaScript, remote script URLs, or arbitrary commands
- **THEN** the extension SHALL treat it as data and SHALL NOT execute it
