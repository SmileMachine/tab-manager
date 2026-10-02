import { useEffect, useRef, useState } from 'react';
import { Send, Settings, Square } from 'lucide-react';
import type { BrowserSnapshotView } from '../domain/types';
import { createBrowserSnapshotView } from '../domain/snapshot';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { loadAgentConnection, loadAgentPrivacySettings } from './storage';
import { createOrganizerAgent, type OrganizerAgentResult } from './runtime';
import { applyAgentPlan } from './executor';
import { AgentSettings } from './AgentSettings';
import { createSnapshotRevision } from '../codex/snapshot';
import { issueAgentConfirmation } from './confirmation';
import { createBrowserCommandClient } from '../infrastructure/browserCommandClient';
import { AGENT_CONTENT_MESSAGE, type AgentContentResponse } from './contentProtocol';
import type { AgentPlan } from './plan';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  plan?: AgentPlan;
  planState?: 'pending' | 'applying' | 'applied' | 'failed';
};

function messageContent(message: ChatMessage): string {
  if (!message.plan) return message.text;
  const operations = message.plan.operations.map((operation, index) => `${index + 1}. ${operation.kind}: ${operation.reason}`).join('\n');
  return `${message.text}\n\nProposed browser changes (local plan ${message.plan.planId}):\n${message.plan.summary}\n${operations}`;
}

export function OrganizerAgentPanel({ view, api }: { view: BrowserSnapshotView; api: BrowserTabsApi | undefined }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  const agentApi = useRef(createBrowserCommandClient({ source: 'agent' })).current;
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function sendMessage() {
    const text = prompt.trim();
    if (!text || !api || sending) return;
    setPrompt('');
    setError(undefined);
    setSending(true);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const connection = await loadAgentConnection();
      if (!connection?.apiKey) throw new Error('Configure the Agent connection before starting a conversation.');
      const snapshot = await api.loadSnapshot();
      const currentView = createBrowserSnapshotView(snapshot);
      const baseRevision = createSnapshotRevision(snapshot);
      const result = await createOrganizerAgent({
        messages: nextMessages.map((message) => ({ role: message.role, content: messageContent(message) })),
        view: currentView,
        api,
        baseRevision,
        signal: controller.current.signal,
        readPageContent: (tabId) => readPageContent(tabId, currentView),
      }, connection);
      const privacy = await loadAgentPrivacySettings();
      let planState: ChatMessage['planState'] = result.plan ? 'pending' : undefined;
      if (result.plan && privacy.allowAutomaticChanges && !result.plan.highRisk) {
        planState = await applyPlan(result.plan, undefined, false);
      }
      const assistant: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', text: result.text || 'I could not produce a response.', plan: result.plan,
        planState
      };
      setMessages((current) => [...current, assistant]);
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Agent request failed.');
    } finally {
      setSending(false);
    }
  }

  async function readPageContent(tabId: number, currentView: BrowserSnapshotView) {
    const contextTabIds = currentView.windows.flatMap((window) => window.items.filter((item) => !item.tab.incognito && !item.tab.isInternalPage).map((item) => item.tab.id));
    const response = await chrome.runtime.sendMessage({
      type: AGENT_CONTENT_MESSAGE,
      requestId: `agent-${crypto.randomUUID()}`,
      tabId,
      options: { mode: 'excerpt', budget: 'focused', maxChars: 2000 },
      contextTabIds: contextTabIds
    }) as AgentContentResponse;
    if (!response.ok) return { error: 'privacy-tool-disabled', message: response.error ?? 'Page content is unavailable.' };
    return response.outcome;
  }

  async function applyPlan(plan: AgentPlan, messageId: string | undefined, confirm = true): Promise<NonNullable<ChatMessage['planState']>> {
    if (!api) return 'failed';
    setError(undefined);
    setMessages((current) => messageId ? current.map((message) => message.id === messageId ? { ...message, planState: 'applying' } : message) : current);
    try {
      const connection = await loadAgentConnection();
      if (!connection?.apiKey) throw new Error('Agent connection is no longer configured.');
      if (confirm) {
        const confirmed = window.confirm(plan.highRisk
          ? 'This proposal includes closing or discarding tabs. Apply these high-risk operations?'
          : 'Apply this reviewed tab organization proposal?');
        if (!confirmed) {
          setMessages((current) => messageId ? current.map((message) => message.id === messageId ? { ...message, planState: 'pending' } : message) : current);
          return 'pending';
        }
      }
      const confirmation = issueAgentConfirmation(plan, connection.configId);
      await applyAgentPlan(agentApi, plan, { confirmation, configId: connection.configId, confirmHighRisk: !plan.highRisk || confirm });
      setMessages((current) => messageId ? current.map((message) => message.id === messageId ? { ...message, planState: 'applied' } : message) : current);
      return 'applied';
    } catch (cause) {
      setMessages((current) => messageId ? current.map((message) => message.id === messageId ? { ...message, planState: 'failed' } : message) : current);
      setError(cause instanceof Error ? cause.message : 'Unable to apply the Agent proposal.');
      return 'failed';
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return <aside className="agent-panel" aria-label="Organizer Agent">
    <header className="agent-panel-header">
      <div><span className="eyebrow">Organizer Agent</span><h2>Browser workspace</h2></div>
      <button aria-label={settingsOpen ? 'Close Agent settings' : 'Open Agent settings'} className="icon-button" type="button" onClick={() => setSettingsOpen((open) => !open)}><Settings aria-hidden="true" size={17} /></button>
    </header>
    {settingsOpen ? <div className="agent-settings-popover"><AgentSettings /></div> : null}
    <div className="agent-chat" aria-live="polite">
      {messages.length === 0 ? <p className="agent-chat-empty">Ask me to find, filter, or organize tabs. I can ask follow-up questions before proposing any browser changes.</p> : null}
      {messages.map((message) => <article className={`agent-message agent-message-${message.role}`} key={message.id}>
        <div className="agent-message-role">{message.role === 'user' ? 'You' : 'Agent'}</div>
        <p>{message.text}</p>
        {message.plan ? <div className="agent-plan">
          <h3>Proposed changes</h3><p>{message.plan.summary}</p>
          <ul>{message.plan.operations.map((operation, index) => <li key={`${message.id}-${operation.kind}-${index}`}><strong>{operation.kind}</strong> · {operation.reason}</li>)}</ul>
          {message.planState === 'pending' ? <button className="primary-button" type="button" onClick={() => void applyPlan(message.plan!, message.id)}>Apply changes</button> : null}
          {message.planState === 'applying' ? <p className="agent-plan-status">Applying…</p> : null}
          {message.planState === 'applied' ? <p className="agent-plan-status">Changes applied.</p> : null}
          {message.planState === 'failed' ? <p className="agent-plan-status">The proposal was not applied.</p> : null}
        </div> : null}
      </article>)}
      {sending ? <p className="agent-chat-status" role="status">Agent is thinking…</p> : null}
    </div>
    {error ? <p className="agent-error" role="alert">{error}</p> : null}
    <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
      <label className="visually-hidden" htmlFor="agent-composer-input">Message Organizer Agent</label>
      <textarea ref={composerRef} id="agent-composer-input" aria-label="Message Organizer Agent" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Ask about your tabs…" rows={3} disabled={sending} />
      <div className="agent-composer-actions">
        <span className="agent-composer-hint">Enter to send · Shift+Enter for a new line</span>
        {sending ? <button aria-label="Cancel Agent response" className="secondary-button" type="button" onClick={() => controller.current?.abort()}><Square aria-hidden="true" size={14} /> Cancel</button> : <button aria-label="Send message" className="primary-button" type="submit" disabled={!prompt.trim() || !api}><Send aria-hidden="true" size={14} /> Send</button>}
      </div>
    </form>
  </aside>;
}
