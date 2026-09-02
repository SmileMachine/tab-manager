import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DuplicateFilterToggle } from './DuplicateFilterToggle';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('DuplicateFilterToggle', () => {
  it('exposes and toggles its pressed state', () => {
    const onChange = vi.fn();
    render(false, onChange);
    const button = container?.querySelector('button');

    expect(button?.getAttribute('aria-pressed')).toBe('false');
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});

function render(enabled: boolean, onChange: (value: boolean) => void) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<DuplicateFilterToggle enabled={enabled} onChange={onChange} />));
}
