import type { BrowserSnapshotView, NativeGroupId, NativeWindowId } from '../../domain/types';
import type { GroupStatusFilter, PinnedStatusFilter, WindowScope } from '../../domain/filters';
import { DuplicateFilterToggle } from './DuplicateFilterToggle';
import { groupsFromView, windowsFromView } from '../view/groupOptions';
import { parseWindowScope, serializeWindowScope } from '../view/windowScope';

export interface WorkspaceContentToolbarProps {
  view: BrowserSnapshotView;
  optionView?: BrowserSnapshotView;
  windowNames?: Readonly<Record<NativeWindowId, string>>;
  search: string;
  onSearchChange: (value: string) => void;
  windowScope: WindowScope;
  onWindowScopeChange: (scope: WindowScope) => void;
  groupStatus: GroupStatusFilter;
  onGroupStatusChange: (status: GroupStatusFilter) => void;
  pinnedStatus: PinnedStatusFilter;
  onPinnedStatusChange: (status: PinnedStatusFilter) => void;
  groupId: NativeGroupId | 'all';
  onGroupIdChange: (groupId: NativeGroupId | 'all') => void;
  duplicatesOnly: boolean;
  onDuplicatesOnlyChange: (enabled: boolean) => void;
}

export function WorkspaceContentToolbar({
  view,
  optionView = view,
  windowNames = {},
  search,
  onSearchChange,
  windowScope,
  onWindowScopeChange,
  groupStatus,
  onGroupStatusChange,
  pinnedStatus,
  onPinnedStatusChange,
  groupId,
  onGroupIdChange,
  duplicatesOnly,
  onDuplicatesOnlyChange
}: WorkspaceContentToolbarProps) {
  const windows = windowsFromView(optionView, windowNames);
  const groups = groupsFromView(optionView, windowNames);

  return (
    <section className="workspace-content-toolbar" aria-label="Search and filters">
      <div className="toolbar">
        <input aria-label="Search tabs" className="search-input" placeholder="Search title, URL, or domain" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} />
        <DuplicateFilterToggle enabled={duplicatesOnly} onChange={onDuplicatesOnlyChange} />
        <select aria-label="Window scope" value={serializeWindowScope(windowScope)} onChange={(event) => onWindowScopeChange(parseWindowScope(event.target.value))}>
          <option value="current">Current window</option>
          <option value="all">All windows</option>
          {windows.map((window) => <option key={window.id} value={`window:${window.id}`}>{window.name}</option>)}
        </select>
        <select aria-label="Group status" value={groupStatus} onChange={(event) => onGroupStatusChange(event.target.value as GroupStatusFilter)}>
          <option value="all">All tabs</option>
          <option value="grouped">Grouped</option>
          <option value="ungrouped">Ungrouped</option>
        </select>
        <select aria-label="Pinned status" value={pinnedStatus} onChange={(event) => onPinnedStatusChange(event.target.value as PinnedStatusFilter)}>
          <option value="all">Pinned and unpinned</option>
          <option value="pinned">Pinned</option>
          <option value="unpinned">Unpinned</option>
        </select>
        <select aria-label="Group filter" value={groupId} onChange={(event) => onGroupIdChange(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          <option value="all">All groups</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.title || 'Untitled group'}</option>)}
        </select>
      </div>
    </section>
  );
}
