import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TabListRow } from './TabListRow';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('TabListRow', () => {
  it('closes the row tab on middle click without selecting it', () => {
    const handlers = renderRow();
    const tabRow = element<HTMLElement>('.tab-row');
    const event = dispatchAuxClick(tabRow, 1);

    expect(event.defaultPrevented).toBe(true);
    expect(handlers.onCloseTab).toHaveBeenCalledWith(41);
    expect(handlers.onSelectTab).not.toHaveBeenCalled();
  });

  it('closes a grouped row tab on middle click', () => {
    const handlers = renderRow({ grouped: true });

    dispatchAuxClick(element<HTMLElement>('.tab-row'), 1);

    expect(element<HTMLElement>('.tab-grid-row').classList.contains('group-color-blue')).toBe(true);
    expect(handlers.onCloseTab).toHaveBeenCalledWith(41);
  });

  it('preserves left-click selection and right-click context menus', () => {
    const handlers = renderRow();
    const tabRow = element<HTMLElement>('.tab-row');

    act(() => {
      tabRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      tabRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, cancelable: true }));
    });

    expect(handlers.onSelectTab).toHaveBeenCalledWith(41, [41], false);
    expect(handlers.onOpenTabContextMenu).toHaveBeenCalledWith(expect.anything(), 41);
    expect(handlers.onCloseTab).not.toHaveBeenCalled();
  });

  it.each([
    ['selection checkbox', '.selection-checkbox'],
    ['favicon button', '.favicon'],
    ['explicit close button', '.row-action']
  ])('does not close from a middle click on the %s', (_name, selector) => {
    const handlers = renderRow();

    dispatchAuxClick(element<HTMLElement>(selector), 1);

    expect(handlers.onCloseTab).not.toHaveBeenCalled();
  });
});

function renderRow({ grouped = false }: { grouped?: boolean } = {}) {
  const handlers = {
    onActivateTab: vi.fn(),
    onCloseTab: vi.fn(),
    onOpenTabContextMenu: vi.fn(),
    onSelectTab: vi.fn()
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <TabListRow
        contextSourceTabId={undefined}
        onActivateTab={handlers.onActivateTab}
        onCloseTab={handlers.onCloseTab}
        onOpenTabContextMenu={handlers.onOpenTabContextMenu}
        onSelectTab={handlers.onSelectTab}
        orderedTabIds={[41]}
        row={{
          kind: 'tab',
          groupId: grouped ? 9 : -1,
          isGroupEnd: grouped,
          isGroupStart: grouped,
          listIndex: 0,
          tab: {
            active: false,
            audible: false,
            favIconUrl: undefined,
            groupId: grouped ? 9 : -1,
            id: 41,
            index: 0,
            pinned: false,
            title: 'Example tab',
            url: 'https://example.com',
            windowId: 7
          }
        }}
        rowColor={grouped ? 'blue' : undefined}
        selectedTabIds={new Set()}
      />
    );
  });

  return handlers;
}

function dispatchAuxClick(target: HTMLElement, button: number) {
  const event = new MouseEvent('auxclick', { bubbles: true, button, cancelable: true });

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

function element<T extends Element>(selector: string) {
  const result = container?.querySelector<T>(selector);

  if (!result) {
    throw new Error(`Missing test element: ${selector}`);
  }

  return result;
}
