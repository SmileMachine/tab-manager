import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserSnapshotView, NativeTabId } from '../domain/types';
import { createBrowserSnapshotView } from '../domain/snapshot';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { buildAgentScopeMetadata, type AgentScope } from './metadata';
import { loadAgentConnection, loadAgentPrivacySettings } from './storage';
import { createOrganizerAgent, type OrganizerAgentResult } from './runtime';
import { applyAgentPlan } from './executor';
import { AgentSettings } from './AgentSettings';
import { createSnapshotRevision } from '../codex/snapshot';
import { issueAgentConfirmation } from './confirmation';
import { createBrowserCommandClient } from '../infrastructure/browserCommandClient';
import { AGENT_CONTENT_MESSAGE, type AgentContentResponse } from './contentProtocol';

export function OrganizerAgentPanel({ view, selectedTabIds, api }: { view: BrowserSnapshotView; selectedTabIds: ReadonlySet<NativeTabId>; api: BrowserTabsApi | undefined }) {
  const [scopeKind, setScopeKind] = useState<'selected' | 'current-window'>('selected');
  const [allowCrossWindow, setAllowCrossWindow] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<OrganizerAgentResult>();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'awaiting-confirmation' | 'applying' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const agentApi = useMemo(() => createBrowserCommandClient({ source: 'agent' }), []);
  const currentWindow = view.windows.find((window) => window.focused) ?? view.windows[0];
  const scope = useMemo<AgentScope>(() => scopeKind === 'selected'
    ? { kind: 'selected', tabIds: [...selectedTabIds], allowCrossWindow }
    : { kind: 'current-window', windowId: currentWindow?.id ?? -1, allowCrossWindow }, [allowCrossWindow, currentWindow?.id, scopeKind, selectedTabIds]);

  useEffect(() => () => controller.current?.abort(), []);

  async function analyze() {
    if (!api || !prompt.trim()) return;
    setStatus('analyzing'); setError(undefined); setResult(undefined); setText('');
    controller.current?.abort(); controller.current = new AbortController();
    try {
      const connection = await loadAgentConnection();
      if (!connection?.apiKey) throw new Error('Configure the Agent connection before analysis.');
      await loadAgentPrivacySettings();
      const currentSnapshot = await api.loadSnapshot();
      const currentView = createBrowserSnapshotView(currentSnapshot);
      const currentScope = scope.kind === 'selected'
        ? { kind: 'selected' as const, tabIds: scope.tabIds, allowCrossWindow: scope.allowCrossWindow }
        : { kind: 'current-window' as const, windowId: scope.windowId, allowCrossWindow: scope.allowCrossWindow };
      const currentRevision = createSnapshotRevision(currentSnapshot);
      const metadata = buildAgentScopeMetadata(currentView, currentScope, currentRevision);
      const next = await createOrganizerAgent({ prompt: prompt.trim(), scope: currentScope, view: currentView, api, baseRevision: currentRevision, signal: controller.current.signal, onText: setText, readPageContent: readPageContent }, connection);
      // Keep the plan visible for review; no browser write occurs here.
      void metadata;
      setResult(next); setStatus(next.plan ? 'awaiting-confirmation' : 'idle');
    } catch (cause) {
      if ((cause as Error).name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Agent analysis failed.'); setStatus('error');
    }
  }

  async function readPageContent(tabId: number) {
    const response = await chrome.runtime.sendMessage({
      type: AGENT_CONTENT_MESSAGE,
      requestId: `agent-${crypto.randomUUID()}`,
      tabId,
      options: { mode: 'excerpt', budget: 'focused', maxChars: 2000 },
      scopeTabIds: [...(scope.kind === 'selected' ? scope.tabIds : view.windows.find((window) => window.id === scope.windowId)?.items.map((item) => item.tab.id) ?? [])]
    }) as AgentContentResponse;
    if (!response.ok) return { error: 'privacy-tool-disabled', message: response.error ?? 'Page content is unavailable.' };
    return response.outcome;
  }

  async function apply() {
    if (!result?.plan || !api) return;
    setStatus('applying'); setError(undefined);
    try {
      const highRisk = result.plan.highRisk ? window.confirm('This proposal includes closing or discarding tabs. Apply these high-risk operations?') : window.confirm('Apply this reviewed tab organization proposal?');
      if (!highRisk) { setStatus('awaiting-confirmation'); return; }
      const connection = await loadAgentConnection();
      if (!connection?.apiKey) throw new Error('Agent connection is no longer configured.');
      const confirmation = issueAgentConfirmation(result.plan, connection.configId);
      const applied = await applyAgentPlan(agentApi, result.plan, { confirmation, configId: connection.configId, confirmHighRisk: result.plan.highRisk });
      setStatus('done'); setText(`${text}\n\nApplied: ${applied.status}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to apply the Agent proposal.'); setStatus('error'); }
  }

  return <aside className="agent-panel" aria-label="Organizer Agent">
    <div className="agent-panel-header"><div><span className="eyebrow">Organizer Agent</span><h2>Organize this workspace</h2></div><span className={`agent-status agent-status-${status}`}>{status}</span></div>
    <div className="agent-scope"><label>Scope<select value={scopeKind} onChange={(event) => setScopeKind(event.target.value as typeof scopeKind)}><option value="selected">Selected tabs ({selectedTabIds.size})</option><option value="current-window">Current window</option></select></label><label className="agent-settings-check"><input type="checkbox" checked={allowCrossWindow} onChange={(event) => setAllowCrossWindow(event.target.checked)} /> Allow cross-window organization</label></div>
    <textarea aria-label="Agent request" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="For example: group the research tabs by topic" rows={4} />
    <div className="agent-panel-actions"><button className="primary-button" type="button" disabled={status === 'analyzing' || !prompt.trim()} onClick={() => void analyze()}>{status === 'analyzing' ? 'Analyzing…' : 'Analyze'}</button>{status === 'analyzing' ? <button className="secondary-button" type="button" onClick={() => controller.current?.abort()}>Cancel</button> : null}</div>
    {error ? <p className="agent-error" role="alert">{error}</p> : null}
    {text ? <div className="agent-response"><h3>Analysis</h3><p>{text}</p></div> : null}
    {result?.plan ? <div className="agent-plan"><h3>Review proposal</h3><p>{result.plan.summary}</p><ul>{result.plan.operations.map((operation, index) => <li key={`${operation.kind}-${index}`}><strong>{operation.kind}</strong> · {operation.reason}</li>)}</ul><button className="primary-button" type="button" disabled={status === 'applying' || status === 'done'} onClick={() => void apply()}>{status === 'applying' ? 'Applying…' : status === 'done' ? 'Applied' : 'Review and apply'}</button></div> : null}
    <details open={settingsOpen} onToggle={(event) => setSettingsOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>Agent settings</summary>{settingsOpen ? <AgentSettings /> : null}</details>
  </aside>;
}
