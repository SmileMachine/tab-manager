import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSelectedTabCloseShortcut } from './useSelectedTabCloseShortcut';

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

describe('useSelectedTabCloseShortcut', () => {
  it.each(['Delete', 'Backspace'])('opens selected-tab closing for %s', (key) => {
    const onCloseSelectedTabs = renderShortcut();
    const event = dispatchKey(document, key);

    expect(event.defaultPrevented).toBe(true);
    expect(onCloseSelectedTabs).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['input', 'input'],
    ['textarea', 'textarea'],
    ['select', 'select'],
    ['contenteditable element', '[contenteditable]']
  ])('preserves %s behavior', (_name, selector) => {
    const onCloseSelectedTabs = renderShortcut();
    const event = dispatchKey(element<HTMLElement>(selector), 'Delete');

    expect(event.defaultPrevented).toBe(false);
    expect(onCloseSelectedTabs).not.toHaveBeenCalled();
  });

  it.each([
    ['Alt', { altKey: true }],
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Shift', { shiftKey: true }]
  ])('ignores %s-modified shortcuts', (_name, modifiers) => {
    const onCloseSelectedTabs = renderShortcut();
    const event = dispatchKey(document, 'Delete', modifiers);

    expect(event.defaultPrevented).toBe(false);
    expect(onCloseSelectedTabs).not.toHaveBeenCalled();
  });

  it('does not register a shortcut when no tabs are selected', () => {
    const onCloseSelectedTabs = renderShortcut({ enabled: false });
    const event = dispatchKey(document, 'Delete');

    expect(event.defaultPrevented).toBe(false);
    expect(onCloseSelectedTabs).not.toHaveBeenCalled();
  });
});

function renderShortcut({ enabled = true }: { enabled?: boolean } = {}) {
  const onCloseSelectedTabs = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ShortcutHarness enabled={enabled} onCloseSelectedTabs={onCloseSelectedTabs} />
    );
  });

  return onCloseSelectedTabs;
}

function ShortcutHarness({
  enabled,
  onCloseSelectedTabs
}: {
  enabled: boolean;
  onCloseSelectedTabs: () => void;
}) {
  useSelectedTabCloseShortcut({ enabled, onCloseSelectedTabs });

  return (
    <div>
      <input />
      <textarea />
      <select>
        <option>Option</option>
      </select>
      <div contentEditable suppressContentEditableWarning />
    </div>
  );
}

function dispatchKey(target: Document | HTMLElement, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...modifiers });

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
