import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ManagerApp } from '../../src/manager/App';
import '../../src/manager/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ManagerApp />
  </StrictMode>
);
