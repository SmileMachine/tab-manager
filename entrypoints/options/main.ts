import { NATIVE_INTEGRATION_ENABLED_KEY, NATIVE_INTEGRATION_STATUS_KEY, type NativeIntegrationStatus } from '../../src/codex/nativeIntegration';
import './style.css';

const checkbox = document.querySelector<HTMLInputElement>('#enabled')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
document.querySelector('#extension-id')!.textContent = chrome.runtime.id;
function render(value?: NativeIntegrationStatus) {
  if (!checkbox.checked) status.textContent = 'Disabled. No local host connection or reconnection is scheduled.';
  else if (value?.state === 'connected') status.textContent = 'Connected to the local Codex/MCP host.';
  else if (value?.state === 'unavailable') status.textContent = `Local host unavailable. ${value.message ?? 'Check host installation and extension authorization.'} Tab management is still available.`;
  else status.textContent = 'Connecting to the local host…';
}
try {
  const saved = await chrome.storage.local.get([NATIVE_INTEGRATION_ENABLED_KEY, NATIVE_INTEGRATION_STATUS_KEY]);
  checkbox.checked = saved[NATIVE_INTEGRATION_ENABLED_KEY] === true;
  checkbox.disabled = false;
  render(saved[NATIVE_INTEGRATION_STATUS_KEY]);
} catch {
  status.textContent = 'Unable to load settings. Reopen this page to try again.';
}
checkbox.addEventListener('change', async () => {
  checkbox.disabled = true;
  try {
    await chrome.storage.local.set({ [NATIVE_INTEGRATION_ENABLED_KEY]: checkbox.checked });
    render();
  } catch {
    checkbox.checked = !checkbox.checked;
    status.textContent = 'Unable to save the connection setting. Try again.';
  } finally { checkbox.disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (NATIVE_INTEGRATION_ENABLED_KEY in changes) checkbox.checked = changes[NATIVE_INTEGRATION_ENABLED_KEY].newValue === true;
  if (NATIVE_INTEGRATION_STATUS_KEY in changes || NATIVE_INTEGRATION_ENABLED_KEY in changes) render(changes[NATIVE_INTEGRATION_STATUS_KEY]?.newValue);
});
