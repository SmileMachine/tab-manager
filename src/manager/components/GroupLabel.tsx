import { ChevronDown, ChevronRight } from 'lucide-react';

import type { GroupSpan, NativeGroupId } from '../../domain/types';
import type { WindowRow } from '../../domain/windowRows';

export interface GroupLabelProps {
  collapsed: boolean;
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  onOpenMenu: (event: React.MouseEvent) => void;
  onSelectionChange: (selected: boolean) => void;
  onToggle: (groupId: NativeGroupId) => void;
  selectionState: 'unchecked' | 'mixed' | 'checked';
}

export function GroupLabel({
  collapsed,
  group,
  onOpenMenu,
  onSelectionChange,
  onToggle,
  selectionState
}: GroupLabelProps) {
  return (
    <div className="group-label" onContextMenu={onOpenMenu}>
      <input
        aria-label={`Select ${group.title ?? 'Untitled group'}`}
        checked={selectionState === 'checked'}
        className="selection-checkbox no-drag"
        data-indeterminate={selectionState === 'mixed'}
        ref={(input) => {
          if (input) {
            input.indeterminate = selectionState === 'mixed';
          }
        }}
        type="checkbox"
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onSelectionChange(event.target.checked)}
      />
      <div className="group-label-text">
        <strong>{group.title || 'Untitled group'}</strong>
        {!collapsed && group.tabCount > 1 ? <span>{group.tabCount} tabs</span> : null}
      </div>
      {group.tabCount > 1 ? (
        <button
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.title ?? 'group'}`}
          className="icon-button no-drag"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onToggle(group.groupId)}
        >
          {collapsed ? <ChevronRight aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
        </button>
      ) : null}
    </div>
  );
}
