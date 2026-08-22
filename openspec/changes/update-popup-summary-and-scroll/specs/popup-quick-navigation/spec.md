## MODIFIED Requirements

### Requirement: Compact popup overview

The popup SHALL show focused-window and all-window totals for tab count, native group count, and ungrouped tab count. Each metric SHALL place the current value and total on the primary line and its concise explanation below.

#### Scenario: Compare focused and all windows

- **GIVEN** the browser has multiple windows with tabs and native tab groups
- **WHEN** the user opens the extension popup
- **THEN** each summary metric shows the focused-window value followed by the all-window total

### Requirement: Popup version identity

The popup SHALL display the installed extension version beside the product title when the extension runtime provides a manifest version.

#### Scenario: Manifest version available

- **GIVEN** the popup is running as an installed extension
- **WHEN** the popup header renders
- **THEN** the manifest version appears beside the product title

### Requirement: Single popup scroll container

The popup SHALL provide at most one visible vertical scrollbar for its tab and group content.

#### Scenario: Long tab list

- **GIVEN** the current window contains enough groups or recent tabs to exceed the popup content height
- **WHEN** the user scrolls the popup
- **THEN** only the content list scrolls while the document itself does not expose a second scrollbar
