import { describe, expect, it } from 'vitest';

import { createSnapshotEnvelope, createSnapshotRevision, toPortableWorkspace } from './snapshot';
import type { BrowserSnapshot } from '../domain/types';

describe('createSnapshotRevision', () => {
  it('is independent from input collection order and derives group summaries', () => {
    const first = snapshot();
    const second: BrowserSnapshot = {
      windows: [...first.windows].reverse(),
      tabs: [...first.tabs].reverse(),
      groups: [...first.groups].reverse()
    };

    expect(createSnapshotRevision(first)).toBe(createSnapshotRevision(second));

    const envelope = createSnapshotEnvelope(second, {
      capturedAt: '2026-08-20T00:00:00.000Z',
      fieldSet: 'grouping'
    });

    expect(envelope).toMatchObject({
      schemaVersion: 1,
      capturedAt: '2026-08-20T00:00:00.000Z',
      fieldSet: 'grouping',
      snapshot: {
        windows: [{ id: 1, tabCount: 2, groupCount: 1 }],
        groups: [
          {
            id: 3,
            tabIds: [11, 12],
            tabCount: 2,
            startIndex: 0,
            endIndex: 1,
            hostnameCounts: { 'docs.example.test': 2 }
          }
        ]
      }
    });
    expect(envelope.snapshot.tabs[0]).not.toHaveProperty('favIconUrl');
    expect(envelope.snapshot.tabs[0]).not.toHaveProperty('sessionId');
  });

  it('keeps a full revision when returning a minimal field set', () => {
    const source = snapshot();
    const envelope = createSnapshotEnvelope(source, { fieldSet: 'minimal' });

    expect(envelope.revision).toBe(createSnapshotRevision(source));
    expect(envelope.snapshot.tabs[0]).toEqual({
      id: 11,
      windowId: 1,
      index: 0,
      groupId: 3,
      title: 'Guide',
      url: 'https://docs.example.test/guide',
      pinned: true,
      active: true,
      audible: false,
      hostname: 'docs.example.test',
      origin: 'https://docs.example.test',
      protocol: 'https',
      pathname: '/guide',
      isNewTab: false,
      isInternalPage: false,
      isPdf: false,
      nextTabId: 12,
      nextGroupId: 3
    });
  });
});

describe('toPortableWorkspace', () => {
  it('uses document-local identifiers instead of browser ids and preserves group membership', () => {
    const workspace = toPortableWorkspace(snapshot(), '2026-08-20T00:00:00.000Z');

    expect(workspace).toEqual({
      schemaVersion: 1,
      exportedAt: '2026-08-20T00:00:00.000Z',
      activeWindowLocalId: 'window-0',
      windows: [
        {
          localId: 'window-0',
          type: 'normal',
          incognito: false,
          state: 'maximized',
          groups: [
            {
              localId: 'group-0-0',
              title: 'Docs',
              color: 'blue',
              collapsed: false,
              tabLocalIds: ['tab-0-0', 'tab-0-1']
            }
          ],
          tabs: [
            {
              localId: 'tab-0-0',
              index: 0,
              title: 'Guide',
              url: 'https://docs.example.test/guide',
              pinned: true,
              active: true,
              groupLocalId: 'group-0-0'
            },
            {
              localId: 'tab-0-1',
              index: 1,
              title: 'Reference',
              url: 'https://docs.example.test/reference',
              pinned: false,
              active: false,
              groupLocalId: 'group-0-0',
              openerLocalId: 'tab-0-0'
            }
          ]
        }
      ]
    });
  });
});

function snapshot(): BrowserSnapshot {
  return {
    windows: [{ id: 1, focused: true, type: 'normal', state: 'maximized', incognito: false }],
    tabs: [
      {
        id: 11,
        windowId: 1,
        index: 0,
        groupId: 3,
        title: 'Guide',
        url: 'https://docs.example.test/guide',
        pinned: true,
        active: true,
        audible: false,
        favIconUrl: 'https://docs.example.test/favicon.ico',
        hostname: 'docs.example.test',
        origin: 'https://docs.example.test',
        protocol: 'https',
        pathname: '/guide',
        isNewTab: false,
        isInternalPage: false,
        isPdf: false,
        sessionId: 'tab-session-11'
      },
      {
        id: 12,
        windowId: 1,
        index: 1,
        groupId: 3,
        title: 'Reference',
        url: 'https://docs.example.test/reference',
        pinned: false,
        active: false,
        audible: false,
        openerTabId: 11,
        hostname: 'docs.example.test',
        origin: 'https://docs.example.test',
        protocol: 'https',
        pathname: '/reference',
        isNewTab: false,
        isInternalPage: false,
        isPdf: false
      }
    ],
    groups: [{ id: 3, windowId: 1, title: 'Docs', color: 'blue', collapsed: false }]
  };
}
