import { describe, expect, it } from 'vitest';

import {
  defaultDuplicateDetectionStrategies,
  findDuplicateTabIds,
  findDuplicateTabMatches,
  type DuplicateDetectionStrategy
} from './duplicateTabs';
import type { BrowserTabRecord } from './types';

describe('findDuplicateTabMatches', () => {
  it('matches non-empty URLs across windows', () => {
    const matches = findDuplicateTabMatches([
      tab(1, 1, 'First', ' https://example.com/page '),
      tab(2, 2, 'Second', 'https://example.com/page'),
      tab(3, 1, 'Third', 'https://other.example.com')
    ], [defaultDuplicateDetectionStrategies[0]]);

    expect(matches).toEqual([{ strategyId: 'url', key: 'https://example.com/page', tabIds: [1, 2] }]);
  });

  it('matches titles and combines strategies with OR semantics', () => {
    const matches = findDuplicateTabMatches([
      tab(1, 1, 'Same title', 'https://one.example.com'),
      tab(2, 1, 'Same title', 'https://two.example.com'),
      tab(3, 1, 'Unique', 'https://two.example.com')
    ]);

    expect(matches).toEqual([
      { strategyId: 'url', key: 'https://two.example.com', tabIds: [2, 3] },
      { strategyId: 'title', key: 'Same title', tabIds: [1, 2] }
    ]);
    expect([...findDuplicateTabIds([
      tab(1, 1, 'Same title', 'https://one.example.com'),
      tab(2, 1, 'Same title', 'https://two.example.com'),
      tab(3, 1, 'Unique', 'https://two.example.com')
    ])]).toEqual([2, 3, 1]);
  });

  it('does not treat empty values as duplicate keys', () => {
    const matches = findDuplicateTabMatches([
      tab(1, 1, ' ', ' '),
      tab(2, 1, '', undefined),
      tab(3, 1, 'Valid', 'https://example.com')
    ]);

    expect(matches).toEqual([]);
  });

  it('supports site-specific strategies without changing the detector', () => {
    const hostnameStrategy: DuplicateDetectionStrategy = {
      id: 'hostname',
      getKey: (currentTab) => currentTab.hostname ?? undefined
    };

    expect(findDuplicateTabMatches([
      tab(1, 1, 'One', 'https://example.com/a', 'example.com'),
      tab(2, 1, 'Two', 'https://example.com/b', 'example.com')
    ], [hostnameStrategy])).toEqual([
      { strategyId: 'hostname', key: 'example.com', tabIds: [1, 2] }
    ]);
  });
});

function tab(
  id: number,
  windowId: number,
  title: string,
  url: string | undefined,
  hostname?: string
): BrowserTabRecord {
  return {
    id,
    windowId,
    index: id,
    groupId: -1,
    title,
    url,
    pinned: false,
    active: false,
    audible: false,
    hostname
  };
}
