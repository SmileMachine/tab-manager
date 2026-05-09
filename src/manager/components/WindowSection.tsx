import { projectTabDropInView, projectWindowRowTabPositions } from '../../domain/dragProjection';
import { selectionStateForGroup, setGroupSelection } from '../../domain/selection';
import type {
  BrowserTabGroupColor,
  NativeGroupId,
  NativeTabId,
  NativeWindowId,
  WindowView
} from '../../domain/types';
import { createWindowRows, type WindowRow } from '../../domain/windowRows';
import type { TabDropTarget } from '../../domain/commands';
import type { GroupEditMenuState } from './GroupEditPopover';
import { GroupLabel } from './GroupLabel';
import { TabListRow } from './TabListRow';
import { WindowTitle } from './WindowTitle';
import { createGroupLabels } from '../view/groupLabels';

type ActiveDropTarget = TabDropTarget | undefined;
type DragProjection = { draggedTabId: NativeTabId; target: ActiveDropTarget } | undefined;

export interface WindowSectionProps {
  activeDropTarget: ActiveDropTarget;
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  contextSourceTabId: NativeTabId | undefined;
  dragProjection: DragProjection;
  index: number;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenGroupMenu: (state: GroupEditMenuState) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  onToggleGroup: (groupId: NativeGroupId) => void;
  onUpdateWindowName: (windowId: NativeWindowId, name: string) => void;
  selectedTabIds: ReadonlySet<NativeTabId>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Set<NativeTabId>>>;
  windowName: string | undefined;
  windowView: WindowView;
}

export function WindowSection({
  activeDropTarget,
  collapsedGroupIds,
  contextSourceTabId,
  dragProjection,
  index,
  onActivateTab,
  onCloseTab,
  onOpenGroupMenu,
  onOpenTabContextMenu,
  onSelectTab,
  onToggleGroup,
  onUpdateWindowName,
  selectedTabIds,
  setSelectedTabIds,
  windowName,
  windowView
}: WindowSectionProps) {
  const rows = createWindowRows(windowView, collapsedGroupIds);
  const projectedWindowView =
    dragProjection?.target && windowContainsTab(rows, dragProjection.draggedTabId)
      ? projectTabDropInView({ windows: [windowView] }, dragProjection.draggedTabId, dragProjection.target).windows[0]
      : undefined;
  const projectedRows = projectedWindowView ? createWindowRows(projectedWindowView, collapsedGroupIds) : undefined;
  const labelRows = projectedRows ?? rows;
  const labelWindowView = projectedWindowView ?? windowView;
  const spansByStart = new Map(labelWindowView.groupSpans.map((span) => [span.startIndex, span]));
  const groupColors = new Map(windowView.groupSpans.map((span) => [span.groupId, span.color]));
  const projectedGroupId = projectedGroupIdFromTarget(rows, dragProjection?.target);
  const groupLabels = createGroupLabels(labelRows, spansByStart, collapsedGroupIds);
  const projectedTabPositions = projectWindowRowTabPositions(rows, dragProjection?.draggedTabId, dragProjection?.target);
  const orderedTabIds = rows.flatMap((row) => (row.kind === 'tab' ? [row.tab.id] : []));

  return (
    <section className="window-section">
      <header className="window-header">
        <WindowTitle
          defaultName={`Window ${index + 1}`}
          name={windowName}
          onSave={(name) => onUpdateWindowName(windowView.id, name)}
        />
        <p>
          {windowView.items.length} tabs
          {windowView.focused ? <span>Focused</span> : null}
        </p>
      </header>
      <div className="tab-list" role="list">
        {groupLabels.map((label) => (
          <div
            className={`group-rail-item group-color-${label.group.color}`}
            key={`group-label-${label.group.groupId}`}
            style={{ gridRow: `${label.rowStart} / span ${label.rowSpan}` }}
          >
            <GroupLabel
              collapsed={label.collapsed}
              group={label.group}
              onOpenMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenGroupMenu({ group: label.group, x: event.clientX, y: event.clientY });
              }}
              onSelectionChange={(selected) =>
                setSelectedTabIds((current) => setGroupSelection(current, label.group.tabIds, selected))
              }
              onToggle={onToggleGroup}
              selectionState={selectionStateForGroup(selectedTabIds, label.group.tabIds)}
            />
          </div>
        ))}
        {rows.map((row, rowIndex) => (
          <TabListRow
            activeDropTarget={activeDropTarget}
            key={row.kind === 'tab' ? `tab-${row.tab.id}` : `group-${row.groupId}`}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            onOpenTabContextMenu={onOpenTabContextMenu}
            onSelectTab={onSelectTab}
            orderedTabIds={orderedTabIds}
            row={row}
            rowColor={
              row.kind === 'tab'
                ? groupColors.get(row.tab.id === dragProjection?.draggedTabId && projectedGroupId !== undefined ? projectedGroupId : row.groupId)
                : undefined
            }
            rowIndex={
              row.kind === 'tab' && row.tab.id !== dragProjection?.draggedTabId
                ? (projectedTabPositions[row.tab.id] ?? rowIndex + 1) - 1
                : rowIndex
            }
            selectedTabIds={selectedTabIds}
            contextSourceTabId={contextSourceTabId}
            setSelectedTabIds={setSelectedTabIds}
          />
        ))}
      </div>
    </section>
  );
}

function windowContainsTab(rows: WindowRow[], tabId: NativeTabId) {
  return rows.some((row) => row.kind === 'tab' && row.tab.id === tabId);
}

function projectedGroupIdFromTarget(rows: WindowRow[], target: ActiveDropTarget): NativeGroupId | undefined {
  if (!target) {
    return undefined;
  }

  if (target.kind === 'group') {
    return target.groupId;
  }

  return rows.find((row) => row.kind === 'tab' && row.tab.id === target.tabId)?.groupId;
}
