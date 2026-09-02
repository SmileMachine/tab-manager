import type { PortableTab, PortableWorkspace } from '../codex/protocol';

export type SnapshotDiffKind = 'snapshot-only' | 'current-only' | 'changed' | 'unchanged';
export type SnapshotMatchBy = 'url' | 'title' | undefined;
export type SnapshotComparisonField = 'url' | 'title' | 'pinned' | 'window' | 'group' | 'position';

export const DEFAULT_SNAPSHOT_COMPARISON_FIELDS: readonly SnapshotComparisonField[] = [
  'url',
  'title',
  'pinned',
  'window',
  'group'
];

export interface SnapshotComparisonOptions {
  changedFields?: readonly SnapshotComparisonField[];
}

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
  duplicateGroupSize?: number;
}

export interface WorkspaceComparison {
  snapshotTabCount: number;
  currentTabCount: number;
  diffs: SnapshotTabDiff[];
  summary: Record<SnapshotDiffKind, number>;
}

export function comparePortableWorkspaces(
  snapshot: PortableWorkspace,
  current: PortableWorkspace,
  options: SnapshotComparisonOptions = {}
): WorkspaceComparison {
  const changedFields = new Set(options.changedFields ?? DEFAULT_SNAPSHOT_COMPARISON_FIELDS);
  const snapshotTabs = flattenWorkspace(snapshot);
  const currentTabs = flattenWorkspace(current);
  const unmatchedCurrent = new Set(currentTabs.map((entry) => entry.tab.localId));
  const diffs: SnapshotTabDiff[] = [];

  for (const snapshotEntry of snapshotTabs) {
    const match = findBestCandidate(snapshotEntry, currentTabs, unmatchedCurrent);
    if (!match) {
      diffs.push({
        kind: 'snapshot-only',
        snapshot: snapshotEntry,
        details: ['This tab exists in the snapshot but not in the current workspace.']
      });
      continue;
    }

    unmatchedCurrent.delete(match.entry.tab.localId);
    diffs.push(buildMatchedDiff(snapshotEntry, match.entry, match.matchBy, match.candidateCount, changedFields));
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
    'snapshot-only': 0,
    'current-only': 1,
    changed: 2,
    unchanged: 3
  };
  diffs.sort((left, right) => {
    const kindOrder = order[left.kind] - order[right.kind];
    if (kindOrder !== 0) return kindOrder;
    return (left.snapshot?.location.windowIndex ?? left.current?.location.windowIndex ?? 0) -
      (right.snapshot?.location.windowIndex ?? right.current?.location.windowIndex ?? 0) ||
      (left.snapshot?.location.index ?? left.current?.location.index ?? 0) -
      (right.snapshot?.location.index ?? right.current?.location.index ?? 0);
  });

  const summary = {
    'snapshot-only': 0,
    'current-only': 0,
    changed: 0,
    unchanged: 0
  } satisfies Record<SnapshotDiffKind, number>;
  diffs.forEach((diff) => { summary[diff.kind] += 1; });

  return {
    snapshotTabCount: snapshotTabs.length,
    currentTabCount: currentTabs.length,
    diffs,
    summary
  };
}

function findBestCandidate(
  snapshotEntry: SnapshotTabEntry,
  currentTabs: SnapshotTabEntry[],
  unmatchedCurrent: Set<string>
): { entry: SnapshotTabEntry; matchBy: Exclude<SnapshotMatchBy, undefined>; candidateCount: number } | undefined {
  const snapshotUrl = matchValue(snapshotEntry.tab.url ?? snapshotEntry.tab.pendingUrl);
  const snapshotTitle = matchValue(snapshotEntry.tab.title);
  const allUrlCandidates = snapshotUrl
    ? currentTabs.filter((entry) => matchValue(entry.tab.url ?? entry.tab.pendingUrl) === snapshotUrl)
    : [];
  const urlCandidates = allUrlCandidates.filter((entry) => unmatchedCurrent.has(entry.tab.localId));
  if (urlCandidates.length > 0) {
    return { entry: chooseCandidate(snapshotEntry, urlCandidates), matchBy: 'url', candidateCount: allUrlCandidates.length };
  }

  const allTitleCandidates = snapshotTitle
    ? currentTabs.filter((entry) => matchValue(entry.tab.title) === snapshotTitle)
    : [];
  const titleCandidates = allTitleCandidates.filter((entry) => unmatchedCurrent.has(entry.tab.localId));
  if (titleCandidates.length > 0) {
    return { entry: chooseCandidate(snapshotEntry, titleCandidates), matchBy: 'title', candidateCount: allTitleCandidates.length };
  }

  return undefined;
}

function chooseCandidate(snapshotEntry: SnapshotTabEntry, candidates: SnapshotTabEntry[]): SnapshotTabEntry {
  return [...candidates].sort((left, right) => {
    const score = candidateScore(snapshotEntry, right) - candidateScore(snapshotEntry, left);
    if (score !== 0) return score;
    return left.location.windowIndex - right.location.windowIndex ||
      left.location.index - right.location.index ||
      left.tab.localId.localeCompare(right.tab.localId);
  })[0];
}

function candidateScore(snapshotEntry: SnapshotTabEntry, candidate: SnapshotTabEntry) {
  let score = 0;
  if ((snapshotEntry.tab.title ?? '') === (candidate.tab.title ?? '')) score += 16;
  if (snapshotEntry.tab.pinned === candidate.tab.pinned) score += 8;
  if (snapshotEntry.location.groupTitle === candidate.location.groupTitle && snapshotEntry.location.groupColor === candidate.location.groupColor) score += 4;
  if (snapshotEntry.location.windowIndex === candidate.location.windowIndex) score += 2;
  score -= Math.min(Math.abs(snapshotEntry.location.index - candidate.location.index), 100) / 100;
  return score;
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

function buildMatchedDiff(
  snapshot: SnapshotTabEntry,
  current: SnapshotTabEntry,
  matchBy: Exclude<SnapshotMatchBy, undefined>,
  candidateCount: number,
  changedFields: Set<SnapshotComparisonField>
): SnapshotTabDiff {
  const changedDetails: string[] = [];
  if (changedFields.has('url') && (snapshot.tab.url ?? snapshot.tab.pendingUrl ?? '') !== (current.tab.url ?? current.tab.pendingUrl ?? '')) changedDetails.push('URL changed.');
  if (changedFields.has('title') && (snapshot.tab.title ?? '') !== (current.tab.title ?? '')) changedDetails.push('Title changed.');
  if (changedFields.has('pinned') && snapshot.tab.pinned !== current.tab.pinned) changedDetails.push('Pinned state changed.');
  if (changedFields.has('window') && snapshot.location.windowIndex !== current.location.windowIndex) changedDetails.push('Window changed.');
  if (changedFields.has('group') && (snapshot.location.groupTitle !== current.location.groupTitle || snapshot.location.groupColor !== current.location.groupColor)) changedDetails.push('Group changed.');
  if (changedFields.has('position') && snapshot.location.index !== current.location.index) changedDetails.push(`Order changed from ${snapshot.location.index} to ${current.location.index}.`);
  const details = [...changedDetails];
  if (candidateCount > 1) details.push(`Matched one of ${candidateCount} tabs sharing this ${matchBy}.`);

  return {
    kind: changedDetails.length > 0 ? 'changed' : 'unchanged',
    snapshot,
    current,
    matchBy,
    details: details.length > 0 ? details : ['No selected comparison field changed.'],
    ...(candidateCount > 1 ? { duplicateGroupSize: candidateCount } : {})
  };
}

function matchValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
