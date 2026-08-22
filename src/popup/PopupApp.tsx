import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  FolderInput,
  LayoutGrid,
  Layers,
  RefreshCw,
  Search,
  X
} from 'lucide-react';

import type { BrowserSnapshot, BrowserTabRecord } from '../domain/types';
import {
  createChromeBrowserTabsApi,
  moveTabToGroupInBackground,
  type BrowserTabsApi
} from '../infrastructure/browserTabsApi';
import { domainFromUrl } from '../manager/view/url';
import { faviconUrlForPage } from '../manager/view/faviconUrl';
import { createPopupModel, type PopupGroupSummary, type PopupWindowGroupSummary } from './model';
import { measurePopupViewportHeight } from './viewport';

type PopupStatus = 'loading' | 'ready' | 'error';

export function PopupApp() {
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PopupStatus>('loading');
  const [isMovePickerOpen, setIsMovePickerOpen] = useState(false);
  const [moveSearch, setMoveSearch] = useState('');
  const [moveStatus, setMoveStatus] = useState<'idle' | 'moving' | 'error'>('idle');
  const moveTriggerRef = useRef<HTMLButtonElement>(null);
  const movePickerRef = useRef<HTMLDivElement>(null);
  const api = useMemo<BrowserTabsApi | undefined>(
    () => (isExtensionRuntimeAvailable() ? createChromeBrowserTabsApi() : undefined),
    []
  );
  const model = useMemo(() => (snapshot ? createPopupModel(snapshot, search) : undefined), [search, snapshot]);

  const moveGroupWindows = useMemo(() => {
    const normalizedSearch = moveSearch.trim().toLowerCase();
    if (!model || !normalizedSearch) {
      return model?.moveGroupWindows ?? [];
    }

    return model.moveGroupWindows
      .map((window) => ({
        ...window,
        groups: window.groups.filter((group) =>
          [group.title, window.label].some((value) => value?.toLowerCase().includes(normalizedSearch))
        )
      }))
      .filter((window) => window.groups.length > 0);
  }, [model, moveSearch]);

  const totalMoveGroupCount =
    model?.moveGroupWindows.reduce((count, window) => count + window.groups.length, 0) ?? 0;

  const canMoveCurrentTab = Boolean(
    model?.activeTab &&
      model.moveGroupWindows.some((window) => window.groups.some((group) => group.id !== model.activeTab?.groupId))
  );

  useEffect(() => {
    const root = document.documentElement;
    const updatePopupHeight = () => {
      root.style.setProperty('--popup-height', `${measurePopupViewportHeight()}px`);
    };

    updatePopupHeight();
    window.addEventListener('resize', updatePopupHeight);
    window.visualViewport?.addEventListener('resize', updatePopupHeight);

    return () => {
      window.removeEventListener('resize', updatePopupHeight);
      window.visualViewport?.removeEventListener('resize', updatePopupHeight);
      root.style.removeProperty('--popup-height');
    };
  }, []);

  const refresh = useCallback(() => {
    if (!api) {
      setStatus('error');
      return Promise.resolve();
    }

    setStatus('loading');
    return api
      .loadSnapshot()
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [api]);

  useEffect(() => {
    if (!isMovePickerOpen) {
      return;
    }

    const firstTarget = movePickerRef.current?.querySelector<HTMLButtonElement>(
      '[data-move-target]:not(:disabled)'
    );
    firstTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMovePicker();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMovePickerOpen]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api || typeof chrome === 'undefined' || !chrome.windows?.onFocusChanged) {
      return;
    }

    const refreshFocusedWindow = () => {
      void refresh();
    };

    chrome.windows.onFocusChanged.addListener(refreshFocusedWindow);
    return () => {
      chrome.windows.onFocusChanged.removeListener(refreshFocusedWindow);
    };
  }, [api, refresh]);

  const activateTab = useCallback(
    (tab: BrowserTabRecord) => {
      if (!api) {
        return;
      }

      void api
        .activateTab(tab.id, tab.windowId)
        .then(() => window.close())
        .catch(() => setStatus('error'));
    },
    [api]
  );

  const closeMovePicker = useCallback(() => {
    setIsMovePickerOpen(false);
    setMoveSearch('');
    setMoveStatus('idle');
    window.setTimeout(() => moveTriggerRef.current?.focus(), 0);
  }, []);

  const toggleMovePicker = useCallback(() => {
    if (!canMoveCurrentTab) {
      return;
    }

    setMoveStatus('idle');
    setMoveSearch('');
    setIsMovePickerOpen((open) => !open);
  }, [canMoveCurrentTab]);

  const moveActiveTabToGroup = useCallback(
    (group: PopupGroupSummary) => {
      if (!api || !model?.activeTab || model.activeTab.groupId === group.id || moveStatus === 'moving') {
        return;
      }

      setMoveStatus('moving');
      const movePromise =
        model.activeTab.windowId === group.windowId
          ? api.moveTabToGroup(model.activeTab.id, group.id, group.windowId)
          : moveTabToGroupInBackground(model.activeTab.id, group.id, group.windowId);

      void movePromise
        .then(() => refresh())
        .then(() => {
          window.close();
        })
        .catch(() => {
          setMoveStatus('error');
        });
    },
    [api, model, moveStatus, refresh]
  );

  const openManager = useCallback(() => {
    if (!isExtensionRuntimeAvailable()) {
      return;
    }

    void chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') }).then(() => window.close());
  }, []);

  const focusedWindowLabel = 'Current window';
  const extensionVersion = getExtensionVersion();
  const isSearching = search.trim().length > 0;

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="popup-brand">
          <LayoutGrid aria-hidden="true" size={18} strokeWidth={2.2} />
          <h1>Tab Group</h1>
          {extensionVersion ? <span className="popup-version">v{extensionVersion}</span> : null}
        </div>
        <div className="popup-header-actions">
          <button
            aria-label="Refresh tabs"
            className="popup-icon-button"
            data-tooltip="Refresh tabs"
            title="Refresh tabs"
            type="button"
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" size={16} />
          </button>
          <button
            aria-controls="popup-move-picker"
            aria-expanded={isMovePickerOpen}
            aria-haspopup="dialog"
            aria-label="Move current tab"
            className="popup-icon-button popup-move-button"
            data-tooltip="Move current tab"
            disabled={!canMoveCurrentTab}
            ref={moveTriggerRef}
            title="Move current tab"
            type="button"
            onClick={toggleMovePicker}
          >
            <FolderInput aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Open manager"
            className="popup-icon-button popup-manager-button"
            data-tooltip="Open manager"
            title="Open manager"
            type="button"
            onClick={openManager}
          >
            <ExternalLink aria-hidden="true" size={16} />
          </button>
        </div>
        {isMovePickerOpen && model ? (
          <MoveGroupPicker
            activeTab={model.activeTab}
            error={moveStatus === 'error'}
            moveSearch={moveSearch}
            pickerRef={movePickerRef}
            totalGroupCount={totalMoveGroupCount}
            status={moveStatus}
            windows={moveGroupWindows}
            onClose={closeMovePicker}
            onMove={moveActiveTabToGroup}
            onSearch={setMoveSearch}
          />
        ) : null}
      </header>

      {status === 'ready' && model ? (
        <>
          <section aria-label="Focused window summary" className="popup-summary">
            <SummaryStat
              current={model.focusedWindowTabCount}
              icon={<LayoutGrid aria-hidden="true" size={15} />}
              label="tabs"
              total={model.allWindowTabCount}
            />
            <SummaryStat
              current={model.focusedWindowGroupCount}
              icon={<Layers aria-hidden="true" size={15} />}
              label="groups"
              total={model.allWindowGroupCount}
            />
            <SummaryStat
              current={model.focusedWindowUngroupedCount}
              icon={<span aria-hidden="true" className="popup-ungrouped-mark" />}
              label="ungrouped"
              total={model.allWindowUngroupedCount}
            />
          </section>

          <label className="popup-search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search tabs</span>
            <input
              autoFocus
              placeholder="Search tabs"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearch('');
                }
              }}
            />
            {isSearching ? (
              <button
                aria-label="Clear search"
                className="popup-search-clear"
                data-tooltip="Clear search"
                title="Clear search"
                type="button"
                onClick={() => setSearch('')}
              >
                <X aria-hidden="true" size={15} />
              </button>
            ) : null}
          </label>

          <div className="popup-scroll-area">
            {isSearching ? (
              <PopupTabSection
                emptyLabel="No matching tabs"
                tabs={model.searchResults}
                title="Results"
                onActivate={activateTab}
              />
            ) : (
              <>
                <section aria-labelledby="popup-current-window" className="popup-section">
                  <SectionHeading id="popup-current-window" icon={<Layers aria-hidden="true" size={14} />}>
                    {focusedWindowLabel}
                  </SectionHeading>
                  {model.groups.length > 0 ? (
                    <div className="popup-group-list">
                      {model.groups.map((group) => (
                        <button
                          aria-label={`Open ${group.title || 'untitled group'} with ${group.tabCount} tabs`}
                          className="popup-group-row"
                          key={`${group.windowId}-${group.id}`}
                          title={`Open ${group.title || 'Untitled group'}`}
                          type="button"
                          onClick={() => {
                            const tab = snapshot?.tabs.find((candidate) => candidate.id === group.representativeTabId);
                            if (tab) {
                              activateTab(tab);
                            }
                          }}
                        >
                          <span aria-hidden="true" className={`popup-group-dot group-color-${group.color}`} />
                          <span className="popup-row-title">{group.title || 'Untitled group'}</span>
                          <span className="popup-count">{group.tabCount}</span>
                          <ArrowUpRight aria-hidden="true" className="popup-row-icon" size={14} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="popup-empty">No groups</p>
                  )}
                </section>

                <PopupTabSection title="Recent" tabs={model.recentTabs} onActivate={activateTab} />
              </>
            )}
          </div>
        </>
      ) : (
        <div aria-live="polite" className="popup-status">
          {status === 'error' ? <span>Unable to load tabs</span> : <span className="popup-loading-dot" />}
          {status === 'error' ? (
            <button className="popup-retry" type="button" onClick={() => void refresh()}>
              Retry
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}

function MoveGroupPicker({
  activeTab,
  error,
  moveSearch,
  pickerRef,
  status,
  totalGroupCount,
  windows,
  onClose,
  onMove,
  onSearch
}: {
  activeTab?: BrowserTabRecord;
  error: boolean;
  moveSearch: string;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  status: 'idle' | 'moving' | 'error';
  totalGroupCount: number;
  windows: PopupWindowGroupSummary[];
  onClose: () => void;
  onMove: (group: PopupGroupSummary) => void;
  onSearch: (value: string) => void;
}) {
  const [expandedWindows, setExpandedWindows] = useState<Set<number>>(
    () => new Set(windows.filter((window) => window.focused).map((window) => window.windowId))
  );
  const showSearch = totalGroupCount > 8;

  return (
    <div
      aria-labelledby="popup-move-picker-title"
      className="popup-move-picker"
      id="popup-move-picker"
      ref={pickerRef}
      role="dialog"
    >
      <div className="popup-move-picker-header">
        <strong id="popup-move-picker-title">Move current tab</strong>
        <button
          aria-label="Close move picker"
          className="popup-search-clear"
          data-tooltip="Close"
          title="Close"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" size={15} />
        </button>
      </div>

      {activeTab ? (
        <div className="popup-move-context" title={activeTab.title}>
          <span className="popup-favicon" aria-hidden="true">
            {faviconUrlForPage(activeTab.url) ? <img alt="" src={faviconUrlForPage(activeTab.url)} /> : null}
          </span>
          <span className="popup-row-title">{activeTab.title || 'Untitled tab'}</span>
        </div>
      ) : (
        <p className="popup-empty">No active tab</p>
      )}

      {showSearch ? (
        <label className="popup-move-search">
          <Search aria-hidden="true" size={14} />
          <span className="sr-only">Search groups</span>
          <input
            autoComplete="off"
            placeholder="Search groups"
            type="search"
            value={moveSearch}
            onChange={(event) => onSearch(event.target.value)}
          />
          {moveSearch ? (
            <button
              aria-label="Clear group search"
              className="popup-search-clear"
              title="Clear group search"
              type="button"
              onClick={() => onSearch('')}
            >
              <X aria-hidden="true" size={14} />
            </button>
          ) : null}
        </label>
      ) : null}

      <div className="popup-move-list">
        {windows.length > 0 ? (
          windows.map((window) => {
            const isExpanded = window.focused || expandedWindows.has(window.windowId) || Boolean(moveSearch.trim());
            return (
              <section className="popup-move-window" key={window.windowId}>
                {window.focused ? (
                  <h2 className="popup-move-window-heading">{window.label}</h2>
                ) : (
                  <button
                    aria-expanded={isExpanded}
                    className="popup-move-window-toggle"
                    type="button"
                    onClick={() => {
                      setExpandedWindows((current) => {
                        const next = new Set(current);
                        if (next.has(window.windowId)) {
                          next.delete(window.windowId);
                        } else {
                          next.add(window.windowId);
                        }
                        return next;
                      });
                    }}
                  >
                    <span>{window.label}</span>
                    <ChevronDown aria-hidden="true" className={isExpanded ? 'is-expanded' : ''} size={14} />
                  </button>
                )}
                {isExpanded ? (
                  <div className="popup-move-group-list">
                    {window.groups.map((group) => {
                      const isCurrentGroup = activeTab?.groupId === group.id;
                      return (
                        <button
                          aria-label={
                            isCurrentGroup
                              ? `${group.title || 'Untitled group'}, current group`
                              : `Move current tab to ${group.title || 'Untitled group'}`
                          }
                          className="popup-move-group-row"
                          data-move-target="true"
                          disabled={isCurrentGroup || status === 'moving'}
                          key={`${group.windowId}-${group.id}`}
                          title={isCurrentGroup ? 'Current group' : `Move current tab to ${group.title || 'Untitled group'}`}
                          type="button"
                          onClick={() => onMove(group)}
                        >
                          <span aria-hidden="true" className={`popup-group-dot group-color-${group.color}`} />
                          <span className="popup-row-title">{group.title || 'Untitled group'}</span>
                          <span className="popup-count">{group.tabCount}</span>
                          {isCurrentGroup ? (
                            <Check aria-hidden="true" className="popup-move-current" size={15} />
                          ) : (
                            <FolderInput aria-hidden="true" className="popup-row-icon" size={14} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })
        ) : (
          <p className="popup-empty">No groups</p>
        )}
      </div>

      {status === 'moving' ? <p className="popup-move-status">Moving…</p> : null}
      {error ? <p aria-live="polite" className="popup-move-error">Unable to move tab</p> : null}
    </div>
  );
}

function SummaryStat({
  current,
  icon,
  label,
  total
}: {
  current: number;
  icon: React.ReactNode;
  label: string;
  total: number;
}) {
  return (
    <div
      aria-label={`${current} current ${label}, ${total} across all windows`}
      className="popup-summary-stat"
      title={`${current} current · ${total} all windows`}
    >
      <div className="popup-summary-values">
        {icon}
        <strong>{current}</strong>
        <span aria-hidden="true" className="popup-summary-separator">/</span>
        <span className="popup-summary-total">{total}</span>
      </div>
      <span className="popup-summary-label">{label}</span>
    </div>
  );
}

function SectionHeading({ children, icon, id }: { children: React.ReactNode; icon: React.ReactNode; id?: string }) {
  return (
    <h2 className="popup-section-heading" id={id}>
      {icon}
      {children}
    </h2>
  );
}

function PopupTabSection({
  emptyLabel = 'No recent tabs',
  tabs,
  title,
  onActivate
}: {
  emptyLabel?: string;
  tabs: BrowserTabRecord[];
  title: string;
  onActivate: (tab: BrowserTabRecord) => void;
}) {
  return (
    <section aria-label={title} className="popup-section">
      <SectionHeading icon={<ArrowUpRight aria-hidden="true" size={14} />}>{title}</SectionHeading>
      {tabs.length > 0 ? (
        <div className="popup-tab-list">
          {tabs.map((tab) => {
            const faviconUrl = faviconUrlForPage(tab.url);

            return (
              <button
                aria-label={`Open ${tab.title}`}
                className={`popup-tab-row ${tab.active ? 'is-active' : ''}`}
                key={tab.id}
                title={`${tab.title}${tab.url ? ` — ${tab.url}` : ''}`}
                type="button"
                onClick={() => onActivate(tab)}
              >
                <span className="popup-favicon" aria-hidden="true">
                  {faviconUrl ? <img alt="" src={faviconUrl} /> : null}
                </span>
                <span className="popup-tab-copy">
                  <strong>{tab.title || 'Untitled tab'}</strong>
                  <span>{domainFromUrl(tab.url) || tab.url || 'No URL'}</span>
                </span>
                {tab.active ? <span aria-label="Active tab" className="popup-active-dot" title="Active tab" /> : null}
                <ArrowUpRight aria-hidden="true" className="popup-row-icon" size={14} />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="popup-empty">{emptyLabel}</p>
      )}
    </section>
  );
}

function getExtensionVersion() {
  if (!isExtensionRuntimeAvailable()) {
    return undefined;
  }

  return chrome.runtime.getManifest().version;
}

function isExtensionRuntimeAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id && chrome.tabs?.query);
}
