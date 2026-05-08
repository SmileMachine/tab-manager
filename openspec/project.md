# Project Context

## Purpose
This project builds a browser extension for Microsoft Edge, with Chrome
compatibility, for users who keep very large numbers of tabs open. The extension
focuses on managing native browser tab groups, searching and filtering tabs, and
performing clear bulk organization actions across browser windows.

## Tech Stack
- TypeScript
- React
- Vite
- Manifest V3 browser extension APIs
- Native Chromium `tabs`, `windows`, and `tabGroups` APIs

## Project Conventions

### Code Style
- Use TypeScript for all extension and application logic.
- Keep browser APIs behind small adapter interfaces so state logic can be tested
  without a live browser.
- Keep view-model transformation logic separate from React rendering.
- Prefer explicit domain names such as `BrowserSnapshot`, `TabSelection`, and
  `GroupSpan` over UI-only names.

### Architecture Patterns
- Treat browser state as the source of truth.
- Read all windows, tabs, and native tab groups into a snapshot model.
- Render tabs in native browser order inside each window.
- Represent native groups as spans inside that ordered tab list, not as a custom
  grouping system.
- Keep manager UI collapse state separate from native browser group collapse
  state.
- Use command services for write operations, followed by snapshot refresh.

### Testing Strategy
- Unit test snapshot normalization, native-order rendering models, search and
  filtering, selection state, and command planning.
- Use browser API fakes for command-layer tests.
- Verify key extension flows manually in Edge first, then Chrome.
- Add end-to-end automation later when the extension shell and browser test
  environment are established.

### Git Workflow
- Keep changes scoped to the active OpenSpec change.
- Validate OpenSpec changes before implementation.
- Prefer small, reviewable commits once implementation begins.

### OpenSpec Language
- Write `design.md` in Chinese because it is the primary human-facing technical
  design document.
- Write `tasks.md` in Chinese because it is the implementation checklist humans
  and agents review during execution.
- Keep `proposal.md` in English as a concise change summary.
- Keep spec delta files under `specs/<capability>/spec.md` in English for
  stable OpenSpec requirement and scenario structure.
- Keep API names, browser concepts, file paths, type names, and code identifiers
  in English, for example `chrome.tabs`, `tabGroups`, `BrowserSnapshot`, and
  `groupId`.

## Domain Context
- Native browser tab groups cannot exist without tabs.
- Creating a native tab group is therefore always based on selected tabs.
- The extension does not maintain custom group membership.
- Cross-window movement is allowed when moving selected tabs to an existing
  target group.
- Bulk closing is a destructive action and requires confirmation.

## Important Constraints
- Edge is the primary target browser.
- Chrome compatibility is required when the same Chromium extension APIs are
  available.
- The manager page must support users with hundreds of open tabs.
- The manager page must not change native browser group collapsed state when the
  user expands or collapses groups inside the manager UI.

## External Dependencies
- Chromium extension APIs: `chrome.tabs`, `chrome.windows`, `chrome.tabGroups`,
  `chrome.storage`.
- Browser extension permissions must be kept to the capabilities needed for tab
  and group management.
