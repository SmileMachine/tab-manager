## ADDED Requirements

### Requirement: Compact popup overview

The popup SHALL show a compact summary of the focused browser window, including tab count, native group count, and ungrouped tab count when browser state is available.

#### Scenario: Focused window summary

- **GIVEN** the browser has a focused normal window with tabs and native tab groups
- **WHEN** the user opens the extension popup
- **THEN** the popup shows the focused window counts without opening the manager page

#### Scenario: Browser state unavailable

- **GIVEN** the popup cannot load browser state
- **WHEN** the popup finishes loading
- **THEN** it shows a concise error state and keeps the manager action available

### Requirement: Search and activate tabs

The popup SHALL search open tabs by title, URL, or hostname and SHALL activate a selected result in its owning browser window.

#### Scenario: Search by title

- **GIVEN** an open tab title contains the search text
- **WHEN** the user types the search text
- **THEN** the matching tab appears as an activatable result

#### Scenario: Search by URL or hostname

- **GIVEN** an open tab URL or hostname contains the search text
- **WHEN** the user types the search text
- **THEN** the matching tab appears as an activatable result

#### Scenario: Activate search result

- **GIVEN** a matching tab is shown
- **WHEN** the user clicks or keyboard-activates the result
- **THEN** the extension focuses the tab's window and activates the tab

### Requirement: Current-window group navigation

The popup SHALL list native groups in the focused window with group color and tab count, and SHALL activate a representative tab when the user chooses a group.

#### Scenario: Activate group

- **GIVEN** the focused window contains a native group
- **WHEN** the user chooses the group row
- **THEN** the extension activates the group's active tab, or its first tab when no group tab is active

### Requirement: Recent tab shortcuts

The popup SHALL show a bounded list of recently accessed open tabs using `lastAccessed` when available.

#### Scenario: Recent tabs

- **GIVEN** multiple open tabs have access timestamps
- **WHEN** the user opens the popup without a search query
- **THEN** the popup shows at most five recent tabs in descending access order

### Requirement: Icon-led accessible controls

The popup SHALL use concise icon-led controls where appropriate, and every icon-only control SHALL expose an accessible name and a native tooltip.

#### Scenario: Icon control discoverability

- **GIVEN** the popup contains an icon-only control
- **WHEN** the user hovers or focuses the control
- **THEN** the control exposes a short tooltip and remains keyboard-visible with a focus indicator
