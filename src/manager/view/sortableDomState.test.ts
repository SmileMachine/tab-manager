import { describe, expect, it } from 'vitest';

import { readSortableItemsFromRoot, readSortableWindowStatesFromDocument } from './sortableDomState';

describe('sortable DOM state', () => {
  it('folds consecutive expanded group rows into a group item', () => {
    const root = rootElement(`
      <div data-sortable-kind="tab" data-tab-id="1"></div>
      <div data-sortable-kind="tab" data-tab-id="2" data-group-id="7"></div>
      <div data-sortable-kind="tab" data-tab-id="3" data-group-id="7"></div>
      <div data-sortable-kind="tab" data-tab-id="4"></div>
    `);

    expect(readSortableItemsFromRoot(root)).toEqual([
      { kind: 'tab', tabId: 1 },
      { kind: 'group', groupId: 7, tabIds: [2, 3] },
      { kind: 'tab', tabId: 4 }
    ]);
  });

  it('maps a collapsed group summary to a group item', () => {
    const root = rootElement(`
      <div data-sortable-kind="tab" data-tab-id="1"></div>
      <div data-sortable-kind="group-summary" data-group-id="8" data-tab-ids="2,3,4"></div>
      <div data-sortable-kind="tab" data-tab-id="5"></div>
    `);

    expect(readSortableItemsFromRoot(root)).toEqual([
      { kind: 'tab', tabId: 1 },
      { kind: 'group', groupId: 8, tabIds: [2, 3, 4] },
      { kind: 'tab', tabId: 5 }
    ]);
  });

  it('keeps a single-tab group as a group item', () => {
    const root = rootElement(`
      <div data-sortable-kind="tab" data-tab-id="1" data-group-id="9"></div>
      <div data-sortable-kind="tab" data-tab-id="2"></div>
    `);

    expect(readSortableItemsFromRoot(root)).toEqual([
      { kind: 'group', groupId: 9, tabIds: [1] },
      { kind: 'tab', tabId: 2 }
    ]);
  });

  it('uses the drop group override when a tab moves into a group', () => {
    const root = rootElement(`
      <div data-sortable-kind="tab" data-tab-id="1" data-group-id="7"></div>
      <div data-sortable-kind="tab" data-tab-id="2" data-drop-group-id="7"></div>
      <div data-sortable-kind="tab" data-tab-id="3" data-group-id="7"></div>
    `);

    expect(readSortableItemsFromRoot(root)).toEqual([{ kind: 'group', groupId: 7, tabIds: [1, 2, 3] }]);
  });

  it('uses the drop group override when a grouped tab moves out of a group', () => {
    const root = rootElement(`
      <div data-sortable-kind="tab" data-tab-id="1" data-group-id="7"></div>
      <div data-sortable-kind="tab" data-tab-id="2" data-group-id="7"></div>
      <div data-sortable-kind="tab" data-tab-id="3" data-group-id="7" data-drop-group-id="-1"></div>
    `);

    expect(readSortableItemsFromRoot(root)).toEqual([
      { kind: 'group', groupId: 7, tabIds: [1, 2] },
      { kind: 'tab', tabId: 3 }
    ]);
  });

  it('reads every sortable window root from the document', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <div data-sortable-kind="tab" data-tab-id="1"></div>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <div data-sortable-kind="tab" data-tab-id="2" data-group-id="10"></div>
      </div>
    `;

    expect(readSortableWindowStatesFromDocument(document)).toEqual([
      { windowId: 11, items: [{ kind: 'tab', tabId: 1 }] },
      { windowId: 12, items: [{ kind: 'group', groupId: 10, tabIds: [2] }] }
    ]);
  });
});

function rootElement(innerHtml: string) {
  const root = document.createElement('div');
  root.className = 'sortable-window-root';
  root.dataset.windowId = '1';
  root.innerHTML = innerHtml;
  return root;
}
