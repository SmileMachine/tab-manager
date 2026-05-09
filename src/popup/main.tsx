import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

function openManager() {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
}

function PopupApp() {
  return (
    <main className="popup-shell">
      <h1>Tab Group</h1>
      <button type="button" onClick={openManager}>
        Open manager
      </button>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);

