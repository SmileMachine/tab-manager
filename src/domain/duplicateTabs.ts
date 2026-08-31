import type { BrowserTabRecord, NativeTabId } from './types';

export interface DuplicateDetectionStrategy {
  id: string;
  getKey: (tab: BrowserTabRecord) => string | undefined;
}

export interface DuplicateTabMatch {
  strategyId: string;
  key: string;
  tabIds: NativeTabId[];
}

function trimmedValue(value: string | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed || undefined;
}

export const defaultDuplicateDetectionStrategies: readonly DuplicateDetectionStrategy[] = [
  {
    id: 'url',
    getKey: (tab) => trimmedValue(tab.url)
  },
  {
    id: 'title',
    getKey: (tab) => trimmedValue(tab.title)
  }
];

export function findDuplicateTabMatches(
  tabs: readonly BrowserTabRecord[],
  strategies: readonly DuplicateDetectionStrategy[] = defaultDuplicateDetectionStrategies
): DuplicateTabMatch[] {
  return strategies.flatMap((strategy) => {
    const tabIdsByKey = new Map<string, NativeTabId[]>();

    for (const tab of tabs) {
      const key = strategy.getKey(tab);
      if (!key) continue;
      const tabIds = tabIdsByKey.get(key) ?? [];
      tabIds.push(tab.id);
      tabIdsByKey.set(key, tabIds);
    }

    return [...tabIdsByKey.entries()]
      .filter(([, tabIds]) => tabIds.length > 1)
      .map(([key, tabIds]) => ({ strategyId: strategy.id, key, tabIds }));
  });
}

export function findDuplicateTabIds(
  tabs: readonly BrowserTabRecord[],
  strategies: readonly DuplicateDetectionStrategy[] = defaultDuplicateDetectionStrategies
): Set<NativeTabId> {
  return new Set(findDuplicateTabMatches(tabs, strategies).flatMap((match) => match.tabIds));
}
