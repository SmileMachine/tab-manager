# Tab Group Manager

[中文说明](README.zh-CN.md)

Tab Group Manager is a Chrome and Microsoft Edge extension for people who keep many tabs open and use native browser tab groups.

It opens a dedicated manager page where you can review windows, search tabs, move tabs between groups, and organize large browsing sessions with more room than the browser tab strip provides.

## Install

### From GitHub Releases

1. Open the project's **Releases** page.
2. Download the latest `tab-group-v*.zip` file.
3. Unzip it to a folder you can keep on your computer.
4. Open your browser's extensions page.
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
5. Enable **Developer mode**.
6. Choose **Load unpacked**.
7. Select the unzipped folder.

After installation, click the extension icon and choose **Open manager**.

When you install this way, keep the unzipped folder in place. The browser loads the extension from that folder.

### From Source

Use this path if you want to build the extension yourself.

```bash
npm install
npm run build
```

Then load the generated `dist/` folder from `chrome://extensions` or `edge://extensions` using **Load unpacked**.

## What You Can Do

### Organize tabs and groups

- Move tabs between groups, out of groups, across windows, or into a new order by dragging.
- Move an entire tab group within the same window or to another window.
- Select multiple tabs, then create a group, move them to an existing group, discard them, ungroup them, or close them.
- Rename tab groups and change their colors.

### Review many windows at once

- View the current window, all windows, or one selected window.
- Rename browser windows inside the manager, so large sessions are easier to scan.
- Collapse windows and groups when you only need a summary.

### Find the right tabs faster

- Search tabs by title, URL, or domain.
- Filter by grouped, ungrouped, pinned, unpinned, or a specific group.

### Adjust the manager view

- Switch between detailed and brief row density.
- Choose readable or full-width layout.

## Permissions

Tab Group Manager asks for these browser permissions:

- `tabs`: read tab titles, URLs, favicons, window IDs, and tab state; move, activate, discard, or close tabs when you ask it to.
- `tabGroups`: read, rename, recolor, and move native browser tab groups.
- `storage`: remember manager preferences such as row density, content width, collapsed sections, window names, and filters.
- `favicon`: show tab favicons in the manager.

The extension does not request broad host permissions such as `<all_urls>`. It does not inject scripts into arbitrary websites.

## Browser Support

Primary targets:

- Google Chrome
- Microsoft Edge

Other Chromium browsers may work if they support the same `tabs` and `tabGroups` extension APIs.

## For Developers

Run tests:

```bash
npm run test
```

Build the extension:

```bash
npm run build
```

Run the full local check:

```bash
npm run check
```

During development, rebuild after code changes and reload the unpacked extension from the browser extensions page.

## Current Limitations

- This is an initial release focused on native tab groups in Chromium browsers.
- Store publishing is not part of the first public installation path.
- Dragging is disabled while search or filters are active, because the visible list no longer represents the full tab order.
