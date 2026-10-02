import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Plug, Shield, Trash2 } from 'lucide-react';
import { deleteAgentConnection, loadAgentConnection, loadAgentPrivacySettings, saveAgentConnection, saveAgentPrivacySettings } from './storage';
import type { AgentKeyRetention, StoredAgentConnection } from './config';
import { checkAgentConnection, type AgentConnectionCheckKind } from './connection';

interface AgentSettingsProps {
  onBack?: () => void;
}

export function AgentSettings({ onBack }: AgentSettingsProps) {
  const [apiRoot, setApiRoot] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [retention, setRetention] = useState<AgentKeyRetention>('local');
  const [allowPageContent, setAllowPageContent] = useState(false);
  const [allowAutomaticChanges, setAllowAutomaticChanges] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'info' | 'error'; text: string }>();
  const [checkMessage, setCheckMessage] = useState<string>();
  const connectionRef = useRef<StoredAgentConnection | undefined>(undefined);
  const saveSequence = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([loadAgentConnection(), loadAgentPrivacySettings()]).then(([connection, privacy]) => {
      if (!active) return;
      connectionRef.current = connection;
      setApiRoot(connection?.apiRoot ?? '');
      setModelId(connection?.modelId ?? '');
      setRetention(connection?.keyRetention ?? 'local');
      setAllowPageContent(privacy.allowPageContent);
      setAllowAutomaticChanges(privacy.allowAutomaticChanges);
      setLoaded(true);
    }).catch((error) => {
      if (active) setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to load Agent settings.' });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => { void persistConnection(); }, 450);
    return () => window.clearTimeout(timer);
  }, [apiRoot, modelId, apiKey, retention, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      void saveAgentPrivacySettings({ allowPageContent, allowAutomaticChanges })
        .then(() => setStatus({ kind: 'success', text: 'Settings saved automatically.' }))
        .catch((error) => setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save Agent permissions.' }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allowAutomaticChanges, allowPageContent, loaded]);

  async function persistConnection() {
    const root = apiRoot.trim();
    const model = modelId.trim();
    const current = connectionRef.current;
    const effectiveKey = apiKey.trim() || (current?.apiRoot === root && current.modelId === model ? current.apiKey : undefined);
    if (!root && !model && !apiKey.trim()) return;
    if (!effectiveKey) {
      setStatus({ kind: 'info', text: 'Fill in the API key to save this connection.' });
      return;
    }
    const sequence = ++saveSequence.current;
    setSaving(true);
    try {
      const saved = await saveAgentConnection({ apiRoot, modelId, apiKey: effectiveKey, keyRetention: retention });
      if (sequence !== saveSequence.current) return;
      connectionRef.current = { ...saved, apiKey: effectiveKey };
      setApiKey('');
      setStatus({ kind: 'success', text: 'Saved automatically.' });
    } catch (error) {
      if (sequence === saveSequence.current) setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save the Agent connection.' });
    } finally {
      if (sequence === saveSequence.current) setSaving(false);
    }
  }

  async function check(kind: AgentConnectionCheckKind) {
    setCheckMessage(undefined);
    await persistConnection();
    setSaving(true);
    try {
      setCheckMessage((await checkAgentConnection(kind, await loadAgentConnection())).message);
    } catch (error) {
      setCheckMessage(error instanceof Error ? error.message : 'Unable to test the Agent endpoint.');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await deleteAgentConnection();
      connectionRef.current = undefined;
      setApiRoot(''); setModelId(''); setApiKey('');
      setStatus({ kind: 'success', text: 'Connection deleted.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to delete the connection.' });
    } finally {
      setSaving(false);
    }
  }

  return <section className="agent-settings" aria-labelledby="agent-settings-title">
    <div className="agent-settings-intro">
      <div className="agent-settings-icon"><Shield aria-hidden="true" size={18} /></div>
      <div><h2 id="agent-settings-title">Agent settings</h2><p>Configure the endpoint and decide which browser capabilities the Agent may use. Changes are saved automatically.</p></div>
    </div>

    <section className="agent-settings-card" aria-labelledby="agent-connection-title">
      <div className="agent-settings-card-heading"><div><span className="eyebrow">Connection</span><h3 id="agent-connection-title">Responses endpoint</h3></div><span className="agent-settings-badge"><Plug aria-hidden="true" size={13} /> BYOK</span></div>
      <p className="settings-help">Requests go directly from the extension to this HTTPS Responses endpoint. Tab titles, sanitized URLs, order, and group metadata may be sent for analysis.</p>
      <div className="agent-settings-form">
        <label className="agent-settings-field"><span>API root</span><input value={apiRoot} onChange={(event) => setApiRoot(event.target.value)} placeholder="https://provider.example/v1" autoComplete="url" /></label>
        <label className="agent-settings-field"><span>Model ID</span><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="your-model-id" /></label>
        <label className="agent-settings-field"><span>API key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={connectionRef.current?.hasApiKey ? 'A key is already saved' : 'Enter your API key'} autoComplete="off" /></label>
        <label className="agent-settings-field"><span>Save key</span><select value={retention} onChange={(event) => setRetention(event.target.value as AgentKeyRetention)}><option value="local">On this device (recommended)</option><option value="session">This browser session only</option></select></label>
      </div>
      <p className="settings-help">The API key is stored in extension local storage by default. It is never synchronized, exported, or shown again after saving.</p>
      <div className="agent-settings-actions"><button className="secondary-button" type="button" disabled={saving || !loaded} onClick={() => void check('basic')}><Plug aria-hidden="true" size={14} /> Test connection</button><button className="secondary-button" type="button" disabled={saving || !loaded} onClick={() => void check('capability')}>Test Agent tools</button><button className="danger-button" type="button" disabled={saving || !loaded} onClick={() => void clear()}><Trash2 aria-hidden="true" size={14} /> Delete connection</button></div>
      {checkMessage ? <p role="status" className="settings-message">{checkMessage}</p> : null}
    </section>

    <section className="agent-settings-card" aria-labelledby="agent-permissions-title">
      <div className="agent-settings-card-heading"><div><span className="eyebrow">Permissions</span><h3 id="agent-permissions-title">What the Agent can do</h3></div><span className="agent-settings-badge is-muted">Local controls</span></div>
      <label className="agent-settings-toggle"><input type="checkbox" checked={allowPageContent} onChange={(event) => setAllowPageContent(event.target.checked)} /><span><strong>Read page content</strong><small>Allow bounded page text to be read when you ask for it. This is disabled by default.</small></span></label>
      <label className="agent-settings-toggle"><input type="checkbox" checked={allowAutomaticChanges} onChange={(event) => setAllowAutomaticChanges(event.target.checked)} /><span><strong>Make low-risk browser changes automatically</strong><small>When disabled, every change waits for approval. Closing or discarding tabs always requires confirmation.</small></span></label>
    </section>

    <div className={`agent-settings-save-state is-${status?.kind ?? 'info'}`} role="status">{saving ? <LoaderCircle aria-hidden="true" className="agent-settings-spinner" size={14} /> : status?.kind === 'success' ? <Check aria-hidden="true" size={14} /> : null}<span>{saving ? 'Saving…' : status?.text ?? 'Changes save automatically.'}</span></div>
    {onBack ? <button className="agent-settings-back" type="button" onClick={onBack}>Back to chat</button> : null}
  </section>;
}
