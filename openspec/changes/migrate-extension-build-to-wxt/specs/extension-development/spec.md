## ADDED Requirements

### Requirement: WXT-managed Chromium extension build
The extension build system SHALL use WXT to produce a Manifest V3 extension for Chromium browsers while preserving the existing popup, manager page, background worker, and permissions.

#### Scenario: Build an unpacked Chromium extension
- **WHEN** a developer runs the production build command
- **THEN** the system SHALL produce a browser-specific directory that Chrome and Edge can load as an unpacked extension
- **AND** the generated manifest SHALL declare the existing `tabs`, `tabGroups`, `storage`, and `favicon` permissions

### Requirement: Watched extension development workflow
The project SHALL provide a WXT development command that watches extension source files and refreshes the development extension when its source changes.

#### Scenario: Edit a manager page source file
- **WHEN** a developer starts the development command and changes a manager page source file
- **THEN** WXT SHALL rebuild the affected extension assets
- **AND** the active extension page SHALL receive the applicable development update or page refresh

### Requirement: Developer workflow documentation
The project documentation SHALL describe the WXT development command, the production build command, and the generated directory to select when loading an unpacked Chromium extension.

#### Scenario: Load a locally built extension
- **WHEN** a developer follows the source-installation instructions
- **THEN** the instructions SHALL identify the WXT-generated Chromium output directory
- **AND** the instructions SHALL not require a manual build-and-reload cycle for each edit during WXT development mode
