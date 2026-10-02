# Change: Add a BYOK organizer agent inside the extension

## Why

Users need a natural-language way to organize tabs across normal browser windows without an external Codex installation. Existing query, preview, operation-journal, and browser-command services provide most execution primitives, but they do not provide an embedded model runtime or a shared execution boundary across manager pages, Popup, and bridge requests. A model-generated plan must never bypass user confirmation or overwrite newer manual organization.

## What Changes

- Add a right-side conversational organizer Agent sidebar to the Current workspace using `ai` ToolLoopAgent and an explicit `@ai-sdk/openai` Responses model; keep the sidebar collapsible from the top toolbar.
- Let users configure an HTTPS API root, API key, and model ID; default to session-only key retention with explicit opt-in for device-local retention.
- Add separate basic-connection and non-destructive Responses tool-round-trip capability checks using synthetic input only.
- Make the Agent conversation operate on all eligible browser tabs without a task scope selector. Send bounded metadata by default; page-content tools enter the available tool list only after the user enables the privacy setting and still pass page-type, host-permission, and budget checks.
- Support multi-turn chat with read/search tools, clarification questions, and editable proposals for grouping, cross-window moves, and high-risk operations such as closing or discarding tabs. Browser writes require approval by default; a single settings permission can allow automatic browser changes. Imports, rollback execution, and autonomous background organization remain outside the Agent tool set.
- Validate plans locally, require explicit application-issued confirmation, then serialize the complete organization batch through a shared background command coordinator.
- Route all extension-originated mutations through that coordinator, including manager drag/menu actions, Popup, Codex writes, workspace import, and rollback. Recheck state at execution time and retain existing behavior and journal semantics.
- Persist bounded non-secret task and approval state; handle cancellation, page closure, service-worker termination, and partial failure without silently reapplying unknown writes.
- Package all executable code locally, lazy-load Agent dependencies, and disable automatic external telemetry/tracing.

## Impact

- New capabilities: `organizer-agent`, `browser-command-coordination`.
- Affected areas: Manager shell and right sidebar layout, conversational Agent UI/settings, browser command adapter and background routing, existing Codex services and journal, storage/permissions, WXT dependencies, tests and release documentation.
- No custom tab membership database; native browser state remains authoritative.
- The new coordinator replaces the manager-instance-only concurrency boundary introduced by `b7ef47a` without treating browser APIs as atomic transactions.
- Prototype evidence: branch `prototype/agent-responses-validation`, commit `88fdb8bd600d9417eee9c9834ab271574f1c6e98`. The prototype is NOT merged into main; real-provider and installed-browser acceptance remain open.
- Status: implementation in progress, approved by the user. Real-provider and installed-browser acceptance remain open.
