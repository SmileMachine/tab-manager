import { describe, expect, it } from 'vitest';

import {
  captureSortableRootDomOrder,
  readSortableItemsFromRoot,
  readSortableWindowStatesFromDocument,
  restoreSortableRootDomOrder
} from './sortableDomState';

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

  it('maps a root-level group block to one group item', () => {
    const root = rootElement(`
      <div data-sortable-kind="tab" data-tab-id="1"></div>
      <section data-sortable-kind="group" data-group-id="8">
        <div class="sortable-group-tabs" data-group-id="8">
          <div data-sortable-kind="tab" data-tab-id="2"></div>
          <div data-sortable-kind="tab" data-tab-id="3"></div>
        </div>
      </section>
      <div data-sortable-kind="tab" data-tab-id="4"></div>
    `);

    expect(readSortableItemsFromRoot(root)).toEqual([
      { kind: 'tab', tabId: 1 },
      { kind: 'group', groupId: 8, tabIds: [2, 3] },
      { kind: 'tab', tabId: 4 }
    ]);
  });

  it('records whole group movement from a root-level group block', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <div data-sortable-kind="tab" data-tab-id="1"></div>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <section data-sortable-kind="group" data-group-id="8" data-whole-group-drag="true">
          <div class="sortable-group-tabs" data-group-id="8">
            <div data-sortable-kind="tab" data-tab-id="2"></div>
            <div data-sortable-kind="tab" data-tab-id="3"></div>
          </div>
        </section>
      </div>
    `;

    expect(readSortableWindowStatesFromDocument(document)).toEqual([
      { windowId: 11, items: [{ kind: 'tab', tabId: 1 }] },
      { windowId: 12, items: [{ kind: 'group', groupId: 8, tabIds: [2, 3] }], wholeGroupMoveIds: [8] }
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

  it('records explicit whole group drag ids without inferring them from normal group rows', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <div data-sortable-kind="tab" data-tab-id="1" data-group-id="7" data-group-tab-ids="1,2" data-whole-group-drag="true"></div>
        <div data-sortable-kind="tab" data-tab-id="2" data-group-id="7" data-group-tab-ids="1,2"></div>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <div data-sortable-kind="tab" data-tab-id="3" data-group-id="8"></div>
      </div>
    `;

    expect(readSortableWindowStatesFromDocument(document)).toEqual([
      { windowId: 11, items: [{ kind: 'group', groupId: 7, tabIds: [1, 2] }], wholeGroupMoveIds: [7] },
      { windowId: 12, items: [{ kind: 'group', groupId: 8, tabIds: [3] }] }
    ]);
  });

  it('keeps whole group drag as one group item when only the representative row moved', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <div data-sortable-kind="tab" data-tab-id="2" data-group-id="7" data-group-tab-ids="1,2"></div>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <div data-sortable-kind="tab" data-tab-id="3"></div>
        <div data-sortable-kind="tab" data-tab-id="1" data-group-id="7" data-group-tab-ids="1,2" data-whole-group-drag="true"></div>
      </div>
    `;

    expect(readSortableWindowStatesFromDocument(document)).toEqual([
      { windowId: 11, items: [] },
      {
        windowId: 12,
        items: [{ kind: 'tab', tabId: 3 }, { kind: 'group', groupId: 7, tabIds: [1, 2] }],
        wholeGroupMoveIds: [7]
      }
    ]);
  });

  it('restores cross-window tab DOM movement before React commits the projected view', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <div data-sortable-kind="tab" data-tab-id="1"></div>
        <div data-sortable-kind="tab" data-tab-id="2"></div>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <div data-sortable-kind="tab" data-tab-id="3"></div>
      </div>
    `;
    const order = captureSortableRootDomOrder(document);
    const firstRoot = document.querySelector<HTMLElement>('[data-window-id="11"]');
    const secondRoot = document.querySelector<HTMLElement>('[data-window-id="12"]');
    const moved = firstRoot?.querySelector<HTMLElement>('[data-tab-id="2"]');

    if (!firstRoot || !secondRoot || !moved) {
      throw new Error('test fixture is invalid');
    }

    secondRoot.insertBefore(moved, secondRoot.firstElementChild);
    expect(readSortableWindowStatesFromDocument(document)).toEqual([
      { windowId: 11, items: [{ kind: 'tab', tabId: 1 }] },
      { windowId: 12, items: [{ kind: 'tab', tabId: 2 }, { kind: 'tab', tabId: 3 }] }
    ]);

    restoreSortableRootDomOrder(order);

    expect([...firstRoot.children].map((child) => (child as HTMLElement).dataset.tabId)).toEqual(['1', '2']);
    expect([...secondRoot.children].map((child) => (child as HTMLElement).dataset.tabId)).toEqual(['3']);
  });

  it('restores cross-window group row DOM movement before React commits the projected view', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <div data-sortable-kind="tab" data-tab-id="1" data-group-id="7"></div>
        <div data-sortable-kind="tab" data-tab-id="2" data-group-id="7"></div>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <div data-sortable-kind="tab" data-tab-id="3"></div>
      </div>
    `;
    const order = captureSortableRootDomOrder(document);
    const firstRoot = document.querySelector<HTMLElement>('[data-window-id="11"]');
    const secondRoot = document.querySelector<HTMLElement>('[data-window-id="12"]');
    const moved = [...(firstRoot?.children ?? [])].filter((child) => (child as HTMLElement).dataset.groupId === '7');

    if (!firstRoot || !secondRoot || moved.length !== 2) {
      throw new Error('test fixture is invalid');
    }

    moved.forEach((element) => secondRoot.insertBefore(element, secondRoot.firstElementChild));
    restoreSortableRootDomOrder(order);

    expect([...firstRoot.children].map((child) => (child as HTMLElement).dataset.tabId)).toEqual(['1', '2']);
    expect([...secondRoot.children].map((child) => (child as HTMLElement).dataset.tabId)).toEqual(['3']);
  });

  it('restores nested group tab DOM movement before React commits the projected view', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root" data-window-id="11">
        <section data-sortable-kind="group" data-group-id="7">
          <div class="sortable-group-tabs" data-group-id="7">
            <div data-sortable-kind="tab" data-tab-id="1"></div>
            <div data-sortable-kind="tab" data-tab-id="2"></div>
          </div>
        </section>
      </div>
      <div class="sortable-window-root" data-window-id="12">
        <div data-sortable-kind="tab" data-tab-id="3"></div>
      </div>
    `;
    const order = captureSortableRootDomOrder(document);
    const groupList = document.querySelector<HTMLElement>('.sortable-group-tabs');
    const secondRoot = document.querySelector<HTMLElement>('[data-window-id="12"]');
    const moved = groupList?.querySelector<HTMLElement>('[data-tab-id="2"]');

    if (!groupList || !secondRoot || !moved) {
      throw new Error('test fixture is invalid');
    }

    secondRoot.insertBefore(moved, secondRoot.firstElementChild);
    restoreSortableRootDomOrder(order);

    expect([...groupList.children].map((child) => (child as HTMLElement).dataset.tabId)).toEqual(['1', '2']);
    expect([...secondRoot.children].map((child) => (child as HTMLElement).dataset.tabId)).toEqual(['3']);
  });
});

function rootElement(innerHtml: string) {
  const root = document.createElement('div');
  root.className = 'sortable-window-root';
  root.dataset.windowId = '1';
  root.innerHTML = innerHtml;
  return root;
}
