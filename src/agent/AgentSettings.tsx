import { useEffect, useState } from 'react';
import { deleteAgentConnection, loadAgentConnection, loadAgentPrivacySettings, saveAgentConnection, saveAgentPrivacySettings } from './storage';
import type { AgentKeyRetention } from './config';
import { checkAgentConnection, type AgentConnectionCheckKind } from './connection';

export function AgentSettings() {
  const [apiRoot, setApiRoot] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [retention, setRetention] = useState<AgentKeyRetention>('session');
  const [allowPageContent, setAllowPageContent] = useState(false);
  const [allowAutomaticChanges, setAllowAutomaticChanges] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string>();

  useEffect(() => {
    void Promise.all([loadAgentConnection(), loadAgentPrivacySettings()]).then(([connection, privacy]) => {
      setApiRoot(connection?.apiRoot ?? '');
      setModelId(connection?.modelId ?? '');
      setRetention(connection?.keyRetention ?? 'session');
      setAllowPageContent(privacy.allowPageContent);
      setAllowAutomaticChanges(privacy.allowAutomaticChanges);
    });
  }, []);

  async function save() {
    setBusy(true); setMessage(undefined);
    try {
      const current = await loadAgentConnection();
      const normalizedRoot = apiRoot.trim();
      const normalizedModel = modelId.trim();
      const effectiveKey = apiKey.trim() || (current?.apiRoot === normalizedRoot && current.modelId === normalizedModel ? current.apiKey : undefined);
      if (!effectiveKey) throw new Error('Enter a new API key when changing the endpoint or model.');
      await saveAgentConnection({ apiRoot, modelId, apiKey: effectiveKey, keyRetention: retention });
      await saveAgentPrivacySettings({ allowPageContent, allowAutomaticChanges });
      setApiKey('');
      setMessage('Agent settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Agent settings.');
    } finally { setBusy(false); }
  }

  async function check(kind: AgentConnectionCheckKind) {
    setBusy(true); setCheckMessage(undefined);
    try { setCheckMessage((await checkAgentConnection(kind, await loadAgentConnection())).message); }
    catch (error) { setCheckMessage(error instanceof Error ? error.message : 'Unable to test the Agent endpoint.'); }
    finally { setBusy(false); }
  }

  async function clear() {
    await deleteAgentConnection();
    setApiRoot(''); setModelId(''); setApiKey(''); setMessage('Agent connection deleted.');
  }

  return <section className="agent-settings" aria-labelledby="agent-settings-title">
    <h2 id="agent-settings-title">Agent connection</h2>
    <p className="settings-help">Requests go directly from this extension to the configured HTTPS Responses endpoint. Tab titles, sanitized URLs, order, and group metadata may be sent for analysis.</p>
    <label>API root<input value={apiRoot} onChange={(event) => setApiRoot(event.target.value)} placeholder="https://provider.example/v1" /></label>
    <label>Model ID<input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="your-model-id" /></label>
    <label>API key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Enter a key; it is not displayed again" /></label>
    <label>Key retention<select value={retention} onChange={(event) => setRetention(event.target.value as AgentKeyRetention)}><option value="session">This browser session only</option><option value="local">Remember locally (plaintext)</option></select></label>
    <label className="agent-settings-check"><input type="checkbox" checked={allowPageContent} onChange={(event) => setAllowPageContent(event.target.checked)} /> Allow Agent to read page content</label>
    <p className="settings-help">Page content is disabled by default. When enabled, each call still checks page type, site permission, and content limits.</p>
    <label className="agent-settings-check"><input type="checkbox" checked={allowAutomaticChanges} onChange={(event) => setAllowAutomaticChanges(event.target.checked)} /> Allow automatic browser changes</label>
    <p className="settings-help">When disabled, every browser change waits for your approval. High-risk actions such as closing or discarding tabs always ask for confirmation.</p>
    <div className="workspace-toolbar-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void check('basic')}>Test connection</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void check('capability')}>Test Agent tools</button><button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>Save settings</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void clear()}>Delete connection</button></div>
    {message ? <p role="status" className="settings-message">{message}</p> : null}
    {checkMessage ? <p role="status" className="settings-message">{checkMessage}</p> : null}
  </section>;
}
