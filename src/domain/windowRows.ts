import type { BrowserTabGroupColor, BrowserTabRecord, NativeGroupId, NativeTabId, WindowView } from './types';

export type WindowRow = TabRow | GroupSummaryRow;

export interface TabRow {
  kind: 'tab';
  tab: BrowserTabRecord;
  groupId: NativeGroupId;
  listIndex: number;
  isGroupStart: boolean;
  isGroupEnd: boolean;
}

export interface GroupSummaryRow {
  kind: 'group-summary';
  groupId: NativeGroupId;
  windowId: number;
  title?: string;
  color: BrowserTabGroupColor;
  tabIds: NativeTabId[];
  tabCount: number;
  domains: string[];
}

export function createWindowRows(window: WindowView, collapsedGroupIds: ReadonlySet<NativeGroupId>): WindowRow[] {
  const spansByStart = new Map(window.groupSpans.map((span) => [span.startIndex, span]));
  const spansByGroup = new Map(window.groupSpans.map((span) => [span.groupId, span]));
  const rows: WindowRow[] = [];

  for (let index = 0; index < window.items.length; index += 1) {
    const span = spansByStart.get(index);

    if (span && collapsedGroupIds.has(span.groupId)) {
      const spanTabs = span.tabIds.flatMap((tabId) => {
        const item = window.items.find((candidate) => candidate.tab.id === tabId);
        return item ? [item.tab] : [];
      });

      rows.push({
        kind: 'group-summary',
        groupId: span.groupId,
        windowId: span.windowId,
        title: span.title,
        color: span.color,
        tabIds: span.tabIds,
        tabCount: span.tabCount,
        domains: uniqueDomains(spanTabs).slice(0, 3)
      });
      index = span.endIndex;
      continue;
    }

    const item = window.items[index];
    const groupSpan = item.tab.groupId === -1 ? undefined : spansByGroup.get(item.tab.groupId);

    rows.push({
      kind: 'tab',
      tab: item.tab,
      groupId: item.tab.groupId,
      listIndex: index,
      isGroupStart: groupSpan?.startIndex === index,
      isGroupEnd: groupSpan?.endIndex === index
    });
  }

  return rows;
}

function uniqueDomains(tabs: BrowserTabRecord[]) {
  return [...new Set(tabs.flatMap((tab) => domainFromUrl(tab.url)))];
}

function domainFromUrl(url: string | undefined) {
  if (!url) {
    return [];
  }

  try {
    return [new URL(url).hostname];
  } catch {
    return [];
  }
}
