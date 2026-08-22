import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PopupApp } from '../../src/popup/PopupApp';
import '../../src/popup/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
