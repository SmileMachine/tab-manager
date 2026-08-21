import { describe, expect, it } from 'vitest';

import { BrowserEventCursor } from './eventCursor';

describe('BrowserEventCursor', () => {
  it('returns bounded events and asks the client to refresh after overflow', () => {
    let time = 0;
    const cursor = new BrowserEventCursor(2, () => new Date(1000 * ++time));
    cursor.append('tabs.created');
    cursor.append('tabs.updated');
    cursor.append('groups.updated');

    expect(cursor.read(0, 10)).toMatchObject({
      events: [expect.objectContaining({ cursor: 2, type: 'tabs.updated' }), expect.objectContaining({ cursor: 3, type: 'groups.updated' })],
      nextCursor: 3,
      requiresSnapshot: true
    });
    expect(cursor.read(2)).toMatchObject({ nextCursor: 3, requiresSnapshot: false });
  });
});
