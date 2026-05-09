const notifyManagerStateChanged = () => {
  chrome.runtime.sendMessage({ type: 'browser-state-changed' }).catch(() => {
    // No manager page is listening.
  });
};

chrome.tabs.onCreated.addListener(notifyManagerStateChanged);
chrome.tabs.onRemoved.addListener(notifyManagerStateChanged);
chrome.tabs.onMoved.addListener(notifyManagerStateChanged);
chrome.tabs.onUpdated.addListener(notifyManagerStateChanged);
chrome.tabs.onAttached.addListener(notifyManagerStateChanged);
chrome.tabs.onDetached.addListener(notifyManagerStateChanged);
chrome.windows.onCreated.addListener(notifyManagerStateChanged);
chrome.windows.onRemoved.addListener(notifyManagerStateChanged);
chrome.tabGroups.onCreated.addListener(notifyManagerStateChanged);
chrome.tabGroups.onUpdated.addListener(notifyManagerStateChanged);
chrome.tabGroups.onRemoved.addListener(notifyManagerStateChanged);

