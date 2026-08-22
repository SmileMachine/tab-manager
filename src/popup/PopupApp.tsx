import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ExternalLink, LayoutGrid, Layers, RefreshCw, Search, X } from 'lucide-react';

import type { BrowserSnapshot, BrowserTabRecord } from '../domain/types';
import { createChromeBrowserTabsApi, type BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { domainFromUrl } from '../manager/view/url';
import { faviconUrlForPage } from '../manager/view/faviconUrl';
import { createPopupModel } from './model';

type PopupStatus = 'loading' | 'ready' | 'error';

export function PopupApp() {
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PopupStatus>('loading');
  const api = useMemo<BrowserTabsApi | undefined>(
    () => (isExtensionRuntimeAvailable() ? createChromeBrowserTabsApi() : undefined),
    []
  );
  const model = useMemo(() => (snapshot ? createPopupModel(snapshot, search) : undefined), [search, snapshot]);

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
    void refresh();
  }, [refresh]);

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
