import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Settings, Square } from 'lucide-react';
import type { BrowserSnapshotView } from '../domain/types';
import { createBrowserSnapshotView } from '../domain/snapshot';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { loadAgentConnection, loadAgentPrivacySettings } from './storage';
import { createOrganizerAgent, type AgentToolActivity } from './runtime';
import { applyAgentPlan } from './executor';
import { AgentSettings } from './AgentSettings';
import { createSnapshotRevision } from '../codex/snapshot';
import { issueAgentConfirmation } from './confirmation';
import { createBrowserCommandClient } from '../infrastructure/browserCommandClient';
import { AGENT_CONTENT_MESSAGE, type AgentContentResponse } from './contentProtocol';
import type { AgentPlan } from './plan';

type ChatToolCall = AgentToolActivity;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ChatToolCall[];
  streaming?: boolean;
  error?: string;
  plan?: AgentPlan;
  planState?: 'pending' | 'applying' | 'applied' | 'failed';
};

const toolLabels: Record<string, string> = {
  read_tabs: '读取标签页',
  search_tabs: '搜索标签页',
  propose_plan: '生成整理方案',
  inspect_page_content: '读取页面正文'
};

function toolLabel(name: string): string {
  return toolLabels[name] ?? `调用工具：${name}`;
}

function toolStatusLabel(status: ChatToolCall['status']): string {
  if (status === 'running') return '进行中';
  if (status === 'failed') return '失败';
  return '已完成';
}

function messageContent(message: ChatMessage): string {
  if (!message.plan) return message.text;
  const operations = message.plan.operations.map((operation, index) => `${index + 1}. ${operation.kind}: ${operation.reason}`).join('\n');
  return `${message.text}\n\nProposed browser changes (local plan ${message.plan.planId}):\n${message.plan.summary}\n${operations}`;
}

function AgentToolCallItem({ toolCall, open }: { toolCall: ChatToolCall; open: boolean }) {
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    setExpanded(open);
  }, [open]);

  return <details className="agent-tool-call" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><span>{toolLabel(toolCall.name)}</span><span className={`agent-tool-call-status is-${toolCall.status}`}>{toolStatusLabel(toolCall.status)}</span></summary>
  </details>;
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
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      toolCalls: [],
      streaming: true
    };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantPlaceholder]);
    controller.current?.abort();
    controller.current = new AbortController();
    const updateAssistant = (update: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) => current.map((message) => message.id === assistantId ? update(message) : message));
    };
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
        onText: (nextText) => updateAssistant((message) => ({ ...message, text: nextText })),
        onToolActivity: (activity) => updateAssistant((message) => {
          const toolCalls = message.toolCalls ?? [];
          const existing = toolCalls.findIndex((toolCall) => toolCall.id === activity.id);
          if (existing < 0) return { ...message, toolCalls: [...toolCalls, activity] };
          const nextToolCalls = [...toolCalls];
          nextToolCalls[existing] = { ...nextToolCalls[existing], ...activity };
          return { ...message, toolCalls: nextToolCalls };
        })
      }, connection);
      const privacy = await loadAgentPrivacySettings();
      const planState: ChatMessage['planState'] = result.plan ? 'pending' : undefined;
      updateAssistant((message) => ({
        ...message,
        text: result.text,
        plan: result.plan,
        planState,
        streaming: false
      }));
      if (result.plan && privacy.allowAutomaticChanges && !result.plan.highRisk) {
        await applyPlan(result.plan, assistantId, false);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error('[Tab Group Manager] Agent request failed.', cause);
      updateAssistant((current) => ({ ...current, streaming: false, error: message }));
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

  if (settingsOpen) {
    return <aside className="agent-panel agent-settings-panel" aria-label="Agent settings">
      <header className="agent-panel-header agent-settings-panel-header">
        <button aria-label="Back to Agent chat" className="icon-button" type="button" onClick={() => setSettingsOpen(false)}><ArrowLeft aria-hidden="true" size={17} /></button>
        <div><span className="eyebrow">Organizer Agent</span><h2>Settings</h2></div>
        <span className="agent-settings-header-spacer" aria-hidden="true" />
      </header>
      <div className="agent-settings-scroll"><AgentSettings onBack={() => setSettingsOpen(false)} /></div>
    </aside>;
  }

  return <aside className="agent-panel" aria-label="Organizer Agent">
    <header className="agent-panel-header">
      <div><span className="eyebrow">Organizer Agent</span><h2>Browser workspace</h2></div>
      <button aria-label="Open Agent settings" className="icon-button" type="button" onClick={() => setSettingsOpen(true)}><Settings aria-hidden="true" size={17} /></button>
    </header>
    <div className="agent-chat" aria-live="polite">
      {messages.length === 0 ? <p className="agent-chat-empty">Ask me to find, filter, or organize tabs. I can ask follow-up questions before proposing any browser changes.</p> : null}
      {messages.map((message) => <article className={`agent-message agent-message-${message.role}`} key={message.id}>
        <div className="agent-message-role">{message.role === 'user' ? 'You' : 'Agent'}</div>
        {message.text ? <p>{message.text}</p> : null}
        {message.role === 'assistant' && message.toolCalls?.map((toolCall) => <AgentToolCallItem key={toolCall.id} toolCall={toolCall} open={Boolean(message.streaming || message.error)} />)}
        {message.error ? <p className="agent-message-error" role="alert">{message.error}</p> : null}
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
