# Change: Refactor manager application actions

## Why
The manager page now has clearer component, hook, and view modules, but `App.tsx` still coordinates browser write actions, refreshes, optimistic updates, UI follow-up state, and error handling. Upcoming group and selection drag features will add more write paths unless those action flows get a clearer application-layer interface.

## What Changes
- Introduce manager application action modules for non-drag write flows first.
- Keep UI components free of direct browser API calls and command execution details.
- Move action orchestration in small slices that can be interleaved with drag feature work.
- Preserve current behavior while making later drag execution paths easier to add.

## Impact
- Affected specs: `manager-architecture`
- Affected code: `src/manager/App.tsx`, `src/manager/application/*`, `src/domain/commands.ts`, `src/infrastructure/browserTabsApi.ts`
- This change is intended to be implemented interleaved with `add-group-and-selection-drag`, not as a large isolated rewrite.
