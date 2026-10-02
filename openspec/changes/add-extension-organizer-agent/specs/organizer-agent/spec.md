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

### Requirement: Broad bounded tab metadata context
The Agent SHALL read all eligible tabs in normal browser windows by default without a user-selectable task context. Each turn SHALL freeze the eligible tab IDs used by its proposal, exclude private-window data and internal pages by default, and send bounded title, sanitized URL, order, and group metadata to the configured service. Page-content tools SHALL be governed by a separate user setting.

#### Scenario: Empty browser context
- **WHEN** there are no eligible tabs
- **THEN** the extension SHALL explain that no eligible browser context is available
- **AND** it SHALL NOT silently process a partial or fabricated context
#### Scenario: Large browser context
- **WHEN** there are more than 200 eligible tabs
- **THEN** the extension SHALL continue without rejecting the request solely because of the tab count
- **AND** it SHALL provide a compact browser summary before the detailed tab tools are used

#### Scenario: Metadata minimization
- **WHEN** metadata is sent for model analysis
- **THEN** URL user information, query strings, and fragments SHALL be excluded and title/path lengths SHALL be bounded
- **AND** the UI SHALL identify the configured destination and the categories of transmitted data
- **AND** task tool calls referencing tab IDs outside the current frozen context SHALL be rejected locally

### Requirement: Privacy-gated page content tools
The extension SHALL keep page-content tools out of the Agent tool list unless the user has manually enabled the page-content privacy setting. The local tool executor SHALL reject those tool calls when the setting is disabled, before reading a tab, requesting host permission, or injecting a script. Enabling the setting SHALL NOT bypass frozen Agent context, page type, host permission, or content budgets.

#### Scenario: Privacy setting disabled
- **GIVEN** the page-content privacy setting is disabled
- **WHEN** an Agent request is constructed
- **THEN** page-content tools SHALL NOT be included in its tools
- **WHEN** the model nevertheless returns a page-content tool call
- **THEN** the local executor SHALL return a disabled-tool error without browser reads, permission requests, or script injection

#### Scenario: Privacy setting enabled
- **GIVEN** the user has enabled page-content access
- **WHEN** the Agent starts a new task
- **THEN** page-content tools MAY be included in that task's tools
- **AND** each invocation SHALL verify frozen Agent context, tab existence, supported page type, host permission, and remaining character/page budget
- **AND** page content SHALL be treated as untrusted data that cannot authorize tools, permissions, context expansion, or writes

#### Scenario: Revoking privacy access
- **WHEN** the user disables page-content access during or before a task
- **THEN** future page-content tool calls SHALL be rejected locally
- **AND** the extension SHALL not use a previous model response as authorization to continue reading

#### Scenario: Untrusted tab text
- **GIVEN** a tab title or URL contains instructions to call tools or change permissions
- **WHEN** the Agent analyzes that metadata
- **THEN** those instructions SHALL NOT grant additional tools, expand scope, authorize writes, or choose a network destination

### Requirement: Proposal-only model tools
The Agent SHALL expose only scoped reads and locally validated proposal tools. Its proposals MAY create groups, assign scoped tabs to existing groups, rename fully scoped affected groups, move scoped tabs across explicitly named normal windows, and suggest high-risk operations such as closing or discarding tabs. Model tools SHALL NOT directly mutate tabs or sign user confirmation.

#### Scenario: A proposal requests writes
- **WHEN** the model proposes a grouping plan
- **THEN** the extension SHALL create an editable pending plan without browser mutation
- **AND** it SHALL validate IDs, group ownership, duplicate membership, allowed operation kinds, and scope
- **AND** it SHALL reject direct browser writes, imports, rollback execution, and any operation outside the current Agent context
- **AND** high-risk operations SHALL remain pending proposals until the user confirms them
- **AND** cross-window moves SHALL require explicit source window, target window, target group or position, and a valid normal-window destination

#### Scenario: New groups and scoped renaming
- **WHEN** a plan creates a group
- **THEN** it SHALL use a plan-local reference resolved by the executor instead of a fabricated native group ID
- **WHEN** a plan renames an existing group
- **THEN** every tab affected by the rename SHALL belong to the frozen Agent context

#### Scenario: High-risk operation proposal
- **WHEN** the Agent proposes closing or discarding tabs
- **THEN** the plan SHALL list each affected tab, the proposed action, and the reason
- **AND** the plan SHALL not execute until the application confirmation requirement is satisfied

#### Scenario: Explicit cross-window proposal
- **WHEN** the Agent proposes moving tabs across windows
- **THEN** the plan SHALL identify the source window, target window, target group or position, and affected tab IDs
- **AND** the plan SHALL be rejected if the target window or group is not valid

### Requirement: Application-issued plan confirmation
Every Agent write SHALL require explicit user confirmation bound to the plan hash, frozen Agent context, reviewed browser revision, and configuration identity. Reviewable plans MAY be retained for up to 24 hours; confirmation SHALL be one-time and valid for at most five minutes. Model output and existing bridge `confirm` fields SHALL NOT themselves constitute user authorization.

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

### Requirement: Conversational organizer sidebar
The Current workspace SHALL expose the Agent as an optional right sidebar that can be expanded or collapsed from the workspace top toolbar. The sidebar SHALL provide a multi-turn conversation, retain the current page session's user and assistant messages in memory, and allow the user to ask follow-up questions or refine a pending organization request without restarting the workspace.

#### Scenario: Sidebar layout and settings
- **WHEN** the user opens the Current workspace
- **THEN** the Agent SHALL appear in the right sidebar rather than above the tab content
- **AND** the top toolbar SHALL provide an accessible expand/collapse control for the right sidebar
- **AND** the sidebar's upper-right control SHALL open Agent settings

#### Scenario: Multi-turn clarification and refinement
- **WHEN** the user asks the Agent to inspect or organize tabs
- **THEN** the Agent MAY answer with a question instead of proposing a write
- **WHEN** the user sends a follow-up message
- **THEN** the Agent SHALL receive the current conversation history and a fresh browser snapshot
- **AND** the user SHALL be able to ask the Agent to search, explain, refine, or execute a previously discussed plan

### Requirement: Broad read access with bounded page privacy
The Agent SHALL read and search all eligible browser tab metadata by default without a user-selectable task context. Private windows and internal pages SHALL remain excluded from model metadata. Page-content reading SHALL remain a separate opt-in capability.

#### Scenario: Default read tools
- **WHEN** the Agent handles a new conversation turn
- **THEN** it SHALL be able to call tab metadata and search tools across eligible windows
- **AND** it SHALL not require a selected-tab or current-window scope

#### Scenario: Page content remains opt-in
- **GIVEN** the user has not enabled page-content access in Agent settings
- **WHEN** the model considers reading a page
- **THEN** the page-content tool SHALL not be included in the available tool list
- **AND** a locally forged call SHALL be rejected before tab access, permission requests, or script injection

### Requirement: Configurable write approval level
Agent settings SHALL expose one simple write permission controlling whether browser changes require approval. The default SHALL require explicit approval of a locally validated plan. When the user explicitly enables automatic browser changes, the Agent MAY apply a validated low-risk plan after the conversation turn without a separate approval click. Closing or discarding tabs SHALL still require separate user confirmation; local validation, revision checks, command coordination, and result reporting SHALL remain mandatory.

#### Scenario: Default approval
- **WHEN** the Agent proposes a browser change while automatic browser changes are disabled
- **THEN** the UI SHALL show the pending operations and an explicit approval action
- **AND** no browser write SHALL begin before the user approves

#### Scenario: Automatic browser changes
- **WHEN** automatic browser changes are enabled and the Agent returns a valid plan
- **THEN** the application MAY execute it after local validation
- **AND** the model response SHALL not itself be treated as an authorization token
- **AND** a stale revision or invalid plan SHALL prevent all writes from starting

### Requirement: Observable tool activity in conversation
The Agent conversation SHALL show each locally executed tool call as a separate activity item without exposing its arguments or result payload. Tool activities SHALL remain expanded while the Agent is running or when the turn ends with an error, and SHALL collapse after a final assistant response is available.

#### Scenario: Tool call while streaming
- **WHEN** the Agent starts or completes a tool call before its final response
- **THEN** the conversation SHALL show one activity item for that tool call
- **AND** the item SHALL show the tool's human-readable name and execution status
- **AND** it SHALL not show the tool arguments or returned browser data

#### Scenario: Final response or failure
- **WHEN** the Agent produces a final response
- **THEN** all tool activity items for that turn SHALL be collapsed by default
- **WHEN** the Agent fails before producing a final response
- **THEN** the tool activity items SHALL remain expanded and the surfaced error SHALL retain its diagnostic message

### Requirement: Tolerant Responses streaming
The Agent transport SHALL preserve streaming Responses events while normalizing a function-call output-item-added event that omits the arguments field required by the bundled AI SDK. The normalization SHALL not alter later function-call argument deltas or completed output items.

#### Scenario: Provider omits initial function-call arguments
- **WHEN** a Responses-compatible endpoint sends a function-call `response.output_item.added` event without `item.arguments`
- **THEN** the extension SHALL forward a compatible event with an empty initial arguments string
- **AND** subsequent argument delta and completion events SHALL remain available to the AI SDK tool loop
- **AND** the Agent SHALL continue to execute the declared tool instead of failing schema validation
