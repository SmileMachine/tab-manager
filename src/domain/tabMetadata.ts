import type { BrowserTabRecord } from './types';

export interface TabUrlMetadata {
  hostname: string | null;
  origin: string | null;
  protocol: string | null;
  pathname: string | null;
  isNewTab: boolean;
  isInternalPage: boolean;
  isPdf: boolean;
}

export function deriveTabUrlMetadata(url: string | undefined): TabUrlMetadata {
  if (!url) {
    return {
      hostname: null,
      origin: null,
      protocol: null,
      pathname: null,
      isNewTab: false,
      isInternalPage: false,
      isPdf: false
    };
  }

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(/:$/, '');
    const hostname = parsed.hostname || null;
    const isInternalPage = ['chrome', 'edge', 'about', 'devtools', 'view-source'].includes(protocol);
    const isNewTab = isInternalPage && (parsed.hostname === 'newtab' || parsed.pathname === '/newtab/');
    const isPdf = parsed.pathname.toLowerCase().endsWith('.pdf');

    return {
      hostname,
      origin: parsed.origin === 'null' ? null : parsed.origin,
      protocol,
      pathname: parsed.pathname || '/',
      isNewTab,
      isInternalPage,
      isPdf
    };
  } catch {
    return {
      hostname: null,
      origin: null,
      protocol: null,
      pathname: null,
      isNewTab: false,
      isInternalPage: false,
      isPdf: false
    };
  }
}

export function enrichTabUrlMetadata(tab: BrowserTabRecord): BrowserTabRecord {
  return { ...tab, ...deriveTabUrlMetadata(tab.url ?? tab.pendingUrl) };
}
