import { X } from 'lucide-react';

import type { BrowserTabGroupColor, NativeTabId, NativeWindowId } from '../../domain/types';
import type { WindowRow } from '../../domain/windowRows';
import { faviconUrlForPage } from '../view/faviconUrl';
import { domainFromUrl } from '../view/url';
import { GroupSummaryRow } from './GroupSummaryRow';

export interface TabListRowProps {
  contextSourceTabId: NativeTabId | undefined;
  onActivateTab: (tabId: NativeTabId, windowId: NativeWindowId) => void;
  onCloseTab: (tabId: NativeTabId) => void;
  onOpenTabContextMenu: (event: React.MouseEvent, tabId: NativeTabId) => void;
  onSelectTab: (tabId: NativeTabId, orderedTabIds: NativeTabId[], shiftKey: boolean) => void;
  orderedTabIds: NativeTabId[];
  row: WindowRow;
  rowColor?: BrowserTabGroupColor;
  readOnly?: boolean;
  selectedTabIds: ReadonlySet<NativeTabId>;
}

export function TabListRow({
  contextSourceTabId,
  onActivateTab,
  onCloseTab,
  onOpenTabContextMenu,
  onSelectTab,
  orderedTabIds,
  row,
  rowColor,
  readOnly = false,
  selectedTabIds
}: TabListRowProps) {
  if (row.kind === 'group-summary') {
    return (
      <div className={`tab-grid-row group-color-${row.color}`} role="listitem">
        <GroupSummaryRow row={row} />
      </div>
    );
  }

  return (
    <div
      className={`tab-grid-row ${rowColor ? `group-color-${rowColor}` : ''} ${
        contextSourceTabId === row.tab.id ? 'is-context-source' : ''
      } ${selectedTabIds.has(row.tab.id) ? 'is-selected' : ''}`}
      data-sortable-kind="tab"
      data-tab-id={row.tab.id}
      role="listitem"
    >
      <div
        className="tab-row"
        onAuxClick={(event) => {
          if (event.button !== 1) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onCloseTab(row.tab.id);
        }}
        onClick={(event) => onSelectTab(row.tab.id, orderedTabIds, event.shiftKey)}
        onContextMenu={readOnly ? undefined : (event) => onOpenTabContextMenu(event, row.tab.id)}
      >
        <input
          aria-label={`Select ${row.tab.title}`}
          checked={selectedTabIds.has(row.tab.id)}
          className="selection-checkbox no-drag"
          type="checkbox"
          onAuxClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onSelectTab(row.tab.id, orderedTabIds, event.shiftKey);
          }}
          onChange={() => undefined}
        />
        {readOnly ? (
          <span aria-hidden="true" className="favicon no-drag">
            {faviconUrlForPage(row.tab.url) ? <img alt="" src={faviconUrlForPage(row.tab.url)} /> : null}
          </span>
        ) : (
          <button
            aria-label={`Go to ${row.tab.title}`}
            className="favicon no-drag"
            type="button"
            onAuxClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onActivateTab(row.tab.id, row.tab.windowId);
            }}
          >
            {faviconUrlForPage(row.tab.url) ? <img alt="" src={faviconUrlForPage(row.tab.url)} /> : null}
          </button>
        )}
        <div className="tab-text">
          <strong>{row.tab.title}</strong>
          <span className="tab-url-full">{row.tab.url || 'No URL'}</span>
          <span className="tab-url-short">{domainFromUrl(row.tab.url) || row.tab.url || 'No URL'}</span>
        </div>
        {row.tab.pinned ? <span className="status-pill">Pinned</span> : null}
        {!readOnly ? <button
          aria-label={`Close ${row.tab.title}`}
          className="row-action icon-button no-drag"
          type="button"
          onAuxClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onCloseTab(row.tab.id);
          }}
        >
          <X aria-hidden="true" size={15} />
        </button> : null}
      </div>
    </div>
  );
}
