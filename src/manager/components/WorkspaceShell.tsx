import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface WorkspaceShellProps {
  sidebar: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

/** Shared two-pane frame for Current, named snapshots, history, and diff views. */
export function WorkspaceShell({ sidebar, toolbar, children, sidebarCollapsed, onToggleSidebar }: WorkspaceShellProps) {
  return (
    <section className={`workspace-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        {sidebar}
        <button
          aria-label={sidebarCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          className="workspace-sidebar-collapse icon-button"
          type="button"
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? <ChevronRight aria-hidden="true" size={15} /> : <ChevronLeft aria-hidden="true" size={15} />}
          <span className="workspace-sidebar-collapse-label">{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      </aside>
      <section className="workspace-main" aria-label="Workspace content">
        <header className="workspace-toolbar">{toolbar}</header>
        <div className="workspace-main-content">{children}</div>
      </section>
    </section>
  );
}
