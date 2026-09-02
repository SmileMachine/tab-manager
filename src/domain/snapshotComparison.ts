import type { PortableTab, PortableWorkspace } from '../codex/protocol';

export type SnapshotDiffKind = 'snapshot-only' | 'current-only' | 'changed' | 'unchanged' | 'ambiguous';
export type SnapshotMatchBy = 'url' | 'title' | undefined;

export interface SnapshotTabLocation {
  windowId: string;
  windowIndex: number;
  groupId?: string;
  groupTitle?: string;
  groupColor?: string;
  index: number;
}

export interface SnapshotTabEntry {
  tab: PortableTab;
  location: SnapshotTabLocation;
}

export interface SnapshotTabDiff {
  kind: SnapshotDiffKind;
  snapshot?: SnapshotTabEntry;
  current?: SnapshotTabEntry;
  matchBy?: Exclude<SnapshotMatchBy, undefined>;
  details: string[];
}

export interface WorkspaceComparison {
  snapshotTabCount: number;
  currentTabCount: number;
  diffs: SnapshotTabDiff[];
  summary: Record<SnapshotDiffKind, number>;
}

export function comparePortableWorkspaces(snapshot: PortableWorkspace, current: PortableWorkspace): WorkspaceComparison {
  const snapshotTabs = flattenWorkspace(snapshot);
  const currentTabs = flattenWorkspace(current);
  const unmatchedCurrent = new Set(currentTabs.map((entry) => entry.tab.localId));
  const diffs: SnapshotTabDiff[] = [];

  for (const snapshotEntry of snapshotTabs) {
    const url = matchValue(snapshotEntry.tab.url ?? snapshotEntry.tab.pendingUrl);
    const title = matchValue(snapshotEntry.tab.title);
    const urlCandidates = url
      ? currentTabs.filter((entry) => unmatchedCurrent.has(entry.tab.localId) && matchValue(entry.tab.url ?? entry.tab.pendingUrl) === url)
      : [];

    if (urlCandidates.length > 1) {
      diffs.push({
        kind: 'ambiguous',
        snapshot: snapshotEntry,
        matchBy: 'url',
        details: [`${urlCandidates.length} current tabs share this URL.`]
      });
      continue;
    }

    if (urlCandidates.length === 1) {
      const currentEntry = urlCandidates[0];
      unmatchedCurrent.delete(currentEntry.tab.localId);
      diffs.push(buildMatchedDiff(snapshotEntry, currentEntry, 'url'));
      continue;
    }

    const titleCandidates = title
      ? currentTabs.filter((entry) => unmatchedCurrent.has(entry.tab.localId) && matchValue(entry.tab.title) === title)
      : [];

    if (titleCandidates.length > 1) {
      diffs.push({
        kind: 'ambiguous',
        snapshot: snapshotEntry,
        matchBy: 'title',
        details: [`${titleCandidates.length} current tabs share this title.`]
      });
      continue;
    }

    if (titleCandidates.length === 1) {
      const currentEntry = titleCandidates[0];
      unmatchedCurrent.delete(currentEntry.tab.localId);
      diffs.push(buildMatchedDiff(snapshotEntry, currentEntry, 'title'));
      continue;
    }

    diffs.push({
      kind: 'snapshot-only',
      snapshot: snapshotEntry,
      details: ['This tab exists in the snapshot but not in the current workspace.']
    });
  }

  for (const currentEntry of currentTabs) {
    if (!unmatchedCurrent.has(currentEntry.tab.localId)) continue;
    diffs.push({
      kind: 'current-only',
      current: currentEntry,
      details: ['This tab exists in the current workspace but not in the snapshot.']
    });
  }

  const order: Record<SnapshotDiffKind, number> = {
    ambiguous: 0,
    'snapshot-only': 1,
    'current-only': 2,
    changed: 3,
    unchanged: 4
  };
  diffs.sort((left, right) => {
    const kindOrder = order[left.kind] - order[right.kind];
    if (kindOrder !== 0) return kindOrder;
    return (left.snapshot?.location.index ?? left.current?.location.index ?? 0) -
      (right.snapshot?.location.index ?? right.current?.location.index ?? 0);
  });

  const summary = {
    'snapshot-only': 0,
    'current-only': 0,
    changed: 0,
    unchanged: 0,
    ambiguous: 0
  } satisfies Record<SnapshotDiffKind, number>;
  diffs.forEach((diff) => { summary[diff.kind] += 1; });

  return {
    snapshotTabCount: snapshotTabs.length,
    currentTabCount: currentTabs.length,
    diffs,
    summary
  };
}

function flattenWorkspace(workspace: PortableWorkspace): SnapshotTabEntry[] {
  return workspace.windows.flatMap((window, windowIndex) => window.tabs.map((tab) => {
    const group = window.groups.find((candidate) => candidate.tabLocalIds.includes(tab.localId));
    return {
      tab,
      location: {
        windowId: window.localId,
        windowIndex,
        groupId: group?.localId,
        groupTitle: group?.title,
        groupColor: group?.color,
        index: tab.index
      }
    };
  }));
}

function buildMatchedDiff(snapshot: SnapshotTabEntry, current: SnapshotTabEntry, matchBy: Exclude<SnapshotMatchBy, undefined>): SnapshotTabDiff {
  const details: string[] = [];
  if ((snapshot.tab.url ?? snapshot.tab.pendingUrl ?? '') !== (current.tab.url ?? current.tab.pendingUrl ?? '')) details.push('URL changed.');
  if ((snapshot.tab.title ?? '') !== (current.tab.title ?? '')) details.push('Title changed.');
  if (snapshot.tab.pinned !== current.tab.pinned) details.push('Pinned state changed.');
  if (snapshot.location.windowIndex !== current.location.windowIndex) details.push('Window changed.');
  if (snapshot.location.groupTitle !== current.location.groupTitle || snapshot.location.groupColor !== current.location.groupColor) details.push('Group changed.');
  if (snapshot.location.index !== current.location.index) details.push(`Order changed from ${snapshot.location.index} to ${current.location.index}.`);

  return {
    kind: details.length > 0 ? 'changed' : 'unchanged',
    snapshot,
    current,
    matchBy,
    details: details.length > 0 ? details : ['No tracked field changed.']
  };
}

function matchValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
