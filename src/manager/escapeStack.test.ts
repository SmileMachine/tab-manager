import { describe, expect, it, vi } from 'vitest';

import { createEscapeStack } from './escapeStack';

describe('createEscapeStack', () => {
  it('dispatches only the latest registered handler', () => {
    const stack = createEscapeStack();
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);

    stack.push(first);
    stack.push(second);

    expect(stack.dispatch()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('restores the previous handler after unregistering the latest handler', () => {
    const stack = createEscapeStack();
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);

    stack.push(first);
    const unregisterSecond = stack.push(second);
    unregisterSecond();

    expect(stack.dispatch()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('reports whether the active handler handled escape', () => {
    const stack = createEscapeStack();

    expect(stack.dispatch()).toBe(false);

    stack.push(() => false);

    expect(stack.dispatch()).toBe(false);
  });
});
