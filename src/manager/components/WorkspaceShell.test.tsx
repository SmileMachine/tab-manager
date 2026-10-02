import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WORKSPACE_AGENT_DEFAULT_WIDTH,
  WORKSPACE_AGENT_MAX_WIDTH,
  WORKSPACE_AGENT_MIN_WIDTH,
  WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
  WORKSPACE_SIDEBAR_MAX_WIDTH,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  WorkspaceShell
} from './WorkspaceShell';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const styles = readFileSync(join(process.cwd(), 'src/manager/styles.css'), 'utf8');
let style: HTMLStyleElement | undefined;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  style?.remove();
  style = undefined;
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

  it('keeps content filters outside the scrollable content and below the workspace header', () => {
    renderShell({ onSidebarWidthChange: vi.fn(), contentToolbar: <section className="workspace-content-toolbar">Filters</section> });

    const main = container?.querySelector('.workspace-main');
    const filters = main?.querySelector(':scope > .workspace-content-toolbar');
    const content = main?.querySelector(':scope > .workspace-main-content');
    expect(main?.classList.contains('has-content-toolbar')).toBe(true);
    expect(filters).toBeTruthy();
    expect(filters?.previousElementSibling?.className).toBe('workspace-toolbar');
    expect(filters?.nextElementSibling).toBe(content);
    expect(content?.querySelector('.workspace-content-toolbar')).toBeNull();
    expect(content?.querySelector('main')?.textContent).toBe('Content');

    applyWorkspaceStyles();
    expect(getComputedStyle(main!).gridTemplateRows).toBe('auto auto minmax(0, 1fr)');
    expect(getComputedStyle(main!).overflow).toBe('hidden');
    expect(getComputedStyle(content!).overflowY).toBe('auto');
  });

  it('uses two layout rows when the workspace has no content toolbar', () => {
    renderShell({ onSidebarWidthChange: vi.fn() });
    const main = container?.querySelector('.workspace-main');
    expect(main?.classList.contains('has-content-toolbar')).toBe(false);
    expect(main?.children).toHaveLength(2);
    applyWorkspaceStyles();
    expect(getComputedStyle(main!).gridTemplateRows).toBe('auto minmax(0, 1fr)');
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

  it('renders an optional right Agent sidebar with its own toggle and resize separator', () => {
    const onAgentWidthChange = vi.fn();
    const onToggleAgent = vi.fn();
    renderShell({ onSidebarWidthChange: vi.fn(), agentSidebar: <aside>Agent</aside>, onAgentWidthChange, onToggleAgent });

    const toggle = container?.querySelector<HTMLButtonElement>('[aria-label="Collapse Organizer Agent"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container?.querySelector('.workspace-agent-sidebar')?.textContent).toContain('Agent');
    expect(container?.querySelector<HTMLElement>('.workspace-shell')?.style.getPropertyValue('--workspace-agent-width')).toBe(`${WORKSPACE_AGENT_DEFAULT_WIDTH}px`);

    const separator = container?.querySelector<HTMLElement>('[aria-label="Resize Organizer Agent sidebar"]');
    expect(separator?.getAttribute('aria-valuemin')).toBe(String(WORKSPACE_AGENT_MIN_WIDTH));
    expect(separator?.getAttribute('aria-valuemax')).toBe(String(WORKSPACE_AGENT_MAX_WIDTH));
    dispatchPointer(separator!, 'pointerdown', 400, 9);
    dispatchPointer(separator!, 'pointermove', 340, 9);
    expect(onAgentWidthChange).toHaveBeenLastCalledWith(WORKSPACE_AGENT_DEFAULT_WIDTH + 60);
    act(() => toggle?.click());
    expect(onToggleAgent).toHaveBeenCalledTimes(1);
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
  contentToolbar?: ReactNode;
  agentSidebar?: ReactNode;
  onAgentWidthChange?: (width: number) => void;
  onToggleAgent?: () => void;
}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <WorkspaceShell
      sidebar={<nav>Navigation</nav>}
      toolbar={<h1>Workspace</h1>}
      contentToolbar={options.contentToolbar}
      sidebarCollapsed={options.sidebarCollapsed ?? false}
      sidebarWidth={WORKSPACE_SIDEBAR_DEFAULT_WIDTH}
      onSidebarWidthChange={options.onSidebarWidthChange}
      onToggleSidebar={vi.fn()}
      agentSidebar={options.agentSidebar}
      agentWidth={WORKSPACE_AGENT_DEFAULT_WIDTH}
      onAgentWidthChange={options.onAgentWidthChange}
      onToggleAgent={options.onToggleAgent}
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

function applyWorkspaceStyles() {
  style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);
}
