# Change: Keep one local extension installation usable after development

## Why
The current WXT development output loads page modules from the development server. Stopping that server leaves the installed development extension unusable. Separate installations and manual startup reloads are not acceptable for the local development workflow. Development convenience must not require ordinary release users to install a native host.

## What Changes
- Keep one browser-specific local installation directory for development and standalone use, preserving the existing development directory where possible.
- Preserve WXT/Vite page HMR during development. Use the existing Native Messaging host only to control entry into and exit from development, not to replace HMR.
- Add an authenticated, local-development-only control channel that notifies the correct installed extension after complete assets are published and requests a reload without manual interaction.
- Do not depend on a running Codex MCP session to perform development mode switches. Keep development control separate from ordinary MCP/browser-control requests.
- Build standalone local assets separately, retain the last successful version, and restore validated standalone assets on graceful shutdown before closing the reload channel.
- Fail explicitly before replacing the usable installation if the required development host or target connection is unavailable. Do not silently fall back to polling, manual reload, or watched production builds.
- Remove marker polling and the proposed additional `alarms` permission from this design.
- Keep release builds self-contained: no development controller, development listener, automatic development host connection, or polling dependency.
- Make the existing Codex/MCP native integration opt-in for release users. Before explicit enablement, do not attempt a native host connection or schedule connection retries. Missing or disconnected hosts must not affect normal tab-management functionality.
- Document optional host installation only for users who choose local Codex/MCP integration; normal extension installation must not include that step.

## Approval Status
Approved in conversation on 2026-10-25: the user accepted using the existing host for the automatic development switching workflow and required the release/user boundary to be included in the plan. Manual startup reloads remain rejected. Marker/alarm polling is superseded and is not part of the approved implementation.

This approval covers the design and implementation direction, not a claim that the new host control protocol or full WXT switching workflow has already been implemented or validated.

## Non-goals
- Guaranteed recovery immediately after SIGKILL, power loss, or an operating-system crash.
- Requiring ordinary users to install Node.js, a native host, or a local development service.
- Exposing reload commands to arbitrary MCP clients, websites, or release extensions.
- Replacing WXT HMR with periodic production rebuilds.
- Treating previous polling experiments as evidence for the newly selected host protocol.

## Impact
- Affected specs: extension-tooling and codex-tab-bridge; existing source requirements live in the migration and Codex bridge changes, not archived base specs.
- Expected code: package scripts, development orchestration, WXT configuration, scoped native-host control, native connection lifecycle/settings, focused tests, development verification script, and user/developer documentation.
- Existing bridge change: `add-codex-tab-control-bridge` remains active. Its general local protocol stays intact; this change owns the default-off lifecycle and isolated development control rather than duplicating ordinary RPC requirements.
- Release build output locations and packaging stay unchanged. Their runtime intentionally changes from unconditional host connection to explicit opt-in; release packages must omit development switching capabilities.
- Browser acceptance: Edge first, Chrome compatibility second; host tests, source checks, and file publication do not by themselves prove browser HMR or successful mode switching.
