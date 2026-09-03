import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
  WORKSPACE_SIDEBAR_MAX_WIDTH,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  WorkspaceShell
} from './WorkspaceShell';

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

describe('WorkspaceShell', () => {
  it('renders a keyboard-accessible resize separator with bounded values', () => {
    const onSidebarWidthChange = vi.fn();
    renderShell({ onSidebarWidthChange });

    const toggle = container?.querySelector<HTMLButtonElement>('.workspace-toolbar > .workspace-sidebar-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.querySelector('.lucide-chevron-left')).toBeTruthy();

    const separator = getSeparator();
    expect(separator.getAttribute('role')).toBe('separator');
    expect(separator.getAttribute('aria-valuemin')).toBe(String(WORKSPACE_SIDEBAR_MIN_WIDTH));
    expect(separator.getAttribute('aria-valuemax')).toBe(String(WORKSPACE_SIDEBAR_MAX_WIDTH));
    expect(separator.getAttribute('aria-valuenow')).toBe(String(WORKSPACE_SIDEBAR_DEFAULT_WIDTH));
    expect(separator.tabIndex).toBe(0);

    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })));
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(WORKSPACE_SIDEBAR_DEFAULT_WIDTH + 16);

    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' })));
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(WORKSPACE_SIDEBAR_MIN_WIDTH);

    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' })));
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(WORKSPACE_SIDEBAR_MAX_WIDTH);
  });

  it('updates the width from a pointer drag and clamps both ends', () => {
    const onSidebarWidthChange = vi.fn();
    renderShell({ onSidebarWidthChange });
    const separator = getSeparator();

    dispatchPointer(separator, 'pointerdown', 100, 7);
    dispatchPointer(separator, 'pointermove', 170, 7);
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(WORKSPACE_SIDEBAR_DEFAULT_WIDTH + 70);
    dispatchPointer(separator, 'pointermove', -100, 7);
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(WORKSPACE_SIDEBAR_MIN_WIDTH);
    dispatchPointer(separator, 'pointerup', -100, 7);

    dispatchPointer(separator, 'pointerdown', 100, 8);
    dispatchPointer(separator, 'pointermove', 500, 8);
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(WORKSPACE_SIDEBAR_MAX_WIDTH);
    dispatchPointer(separator, 'pointerup', 500, 8);
  });

  it('disables the resize separator while the sidebar is collapsed', () => {
    const onSidebarWidthChange = vi.fn();
    renderShell({ onSidebarWidthChange, sidebarCollapsed: true });

    expect(container?.querySelector('.workspace-sidebar-content')).toBeTruthy();
    const toggle = container?.querySelector<HTMLButtonElement>('.workspace-toolbar > .workspace-sidebar-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.querySelector('.lucide-menu')).toBeTruthy();

    expect(container?.querySelector<HTMLElement>('.workspace-shell')?.style.getPropertyValue('--workspace-sidebar-width')).toBe('0px');

    const separator = getSeparator();
    expect(separator.tabIndex).toBe(-1);
    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })));
    expect(onSidebarWidthChange).not.toHaveBeenCalled();
  });
});

function renderShell(options: {
  onSidebarWidthChange: (width: number) => void;
  sidebarCollapsed?: boolean;
}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <WorkspaceShell
      sidebar={<nav>Navigation</nav>}
      toolbar={<h1>Workspace</h1>}
      sidebarCollapsed={options.sidebarCollapsed ?? false}
      sidebarWidth={WORKSPACE_SIDEBAR_DEFAULT_WIDTH}
      onSidebarWidthChange={options.onSidebarWidthChange}
      onToggleSidebar={vi.fn()}
    >
      <main>Content</main>
    </WorkspaceShell>
  ));
}

function getSeparator() {
  const separator = container?.querySelector<HTMLElement>('[role="separator"]');
  if (!separator) throw new Error('Missing sidebar resize separator');
  return separator;
}

function dispatchPointer(element: HTMLElement, type: string, clientX: number, pointerId: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { clientX: { value: clientX }, pointerId: { value: pointerId } });
  act(() => element.dispatchEvent(event));
}
