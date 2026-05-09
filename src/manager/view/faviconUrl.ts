export function faviconUrlForPage(pageUrl: string | undefined) {
  if (!pageUrl || !isExtensionRuntimeAvailable()) {
    return undefined;
  }

  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=16`);
}

function isExtensionRuntimeAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
}
