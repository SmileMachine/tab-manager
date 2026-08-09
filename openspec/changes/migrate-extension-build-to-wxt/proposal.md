# Change: Migrate extension development and build tooling to WXT

## Why
The extension currently uses a custom Vite multi-entry build and requires developers to manually rebuild and reload the unpacked extension after every source change. This slows iteration on the popup, manager page, and Manifest V3 background service worker.

## What Changes
- Replace the custom Vite extension build configuration with WXT while retaining TypeScript and React.
- Move extension entrypoints and manifest configuration to WXT conventions.
- Provide WXT development, production build, and browser-targeted scripts for Chromium browsers.
- Update developer documentation to describe the WXT workflow, generated output directory, and runtime reload limitations.
- Preserve the existing extension permissions, pages, background event behavior, and browser-facing functionality.

## Impact
- Affected specs: `extension-development`
- Affected code: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `public/manifest.json`, extension entrypoints, and developer documentation.
- The generated unpacked-extension directory changes from `dist/` to WXT's browser-specific output directory.
