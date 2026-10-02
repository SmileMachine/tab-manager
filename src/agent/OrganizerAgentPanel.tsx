import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquarePlus, Send, Settings, Square } from 'lucide-react';
import type { BrowserSnapshotView } from '../domain/types';
import { createBrowserSnapshotView } from '../domain/snapshot';
import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import { clearAgentChat, loadAgentChat, loadAgentConnection, loadAgentPrivacySettings, saveAgentChat, type AgentChatMessage } from './storage';
import { createOrganizerAgent, type AgentToolActivity } from './runtime';
import { applyAgentPlan, type AgentApplyResult } from './executor';
import { AgentSettings } from './AgentSettings';
import { createSnapshotRevision } from '../codex/snapshot';
import { issueAgentConfirmation } from './confirmation';
import { createBrowserCommandClient } from '../infrastructure/browserCommandClient';
import { AGENT_CONTENT_MESSAGE, type AgentContentResponse } from './contentProtocol';
import type { AgentPlan, AgentPlanOperation } from './plan';

type ChatToolCall = AgentToolActivity;

type ChatMessage = AgentChatMessage;

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

function operationTitle(operation: AgentPlanOperation): string {
  switch (operation.kind) {
    case 'move-to-group': return `移动到“${operation.targetGroupTitle ?? `分组 #${operation.targetGroupId}`}”`;
    case 'create-group': return `创建“${operation.title}”分组`;
    case 'rename-group': return `重命名分组为“${operation.title}”`;
    case 'close-tabs': return '关闭标签页';
    case 'discard-tabs': return '丢弃标签页';
  }
}

function messageContent(message: ChatMessage): string {
  if (!message.plan) return message.text;
  const operations = message.plan.operations.map((operation, index) => `${index + 1}. ${operation.kind}: ${operation.reason}`).join('\n');
  return `${message.text}\n\nProposed browser changes (local plan ${message.plan.planId}):\n${message.plan.summary}\n${operations}`;
}


function compactPreviousToolActivity(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (!message.toolCalls?.length) return message;
    return {
      ...message,
      toolCalls: message.toolCalls.map(({ id, name, status, summary }) => ({
        id,
        name,
        status,
        summary: summary ?? toolStatusLabel(status)
      }))
    };
  });
}

function AgentToolCallItem({ toolCall, open }: { toolCall: ChatToolCall; open: boolean }) {
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    setExpanded(open);
  }, [open]);

  return <details className="agent-tool-call" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><span className="agent-tool-call-name">{toolLabel(toolCall.name)}</span><span className="agent-tool-call-summary">{toolCall.summary ?? toolStatusLabel(toolCall.status)}</span><span className={`agent-tool-call-status is-${toolCall.status}`}>{toolStatusLabel(toolCall.status)}</span></summary>
    {toolCall.detail ? <p className="agent-tool-call-detail">{toolCall.detail}</p> : null}
  </details>;
}

function AgentPlanDetails({
  message,
  plan,
  onApply
}: {
  message: ChatMessage;
  plan: AgentPlan;
  onApply: (plan: AgentPlan, messageId: string | undefined) => Promise<NonNullable<ChatMessage['planState']>>;
}) {
  const [expanded, setExpanded] = useState(true);

  return <details className="agent-plan" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><span>Proposed changes</span><span className="agent-plan-count">{plan.operations.length} operations</span></summary>
    <div className="agent-plan-content">
      {message.text ? <div className="agent-plan-request"><span className="agent-plan-label">Agent request</span><p>{message.text}</p></div> : null}
      <p className="agent-plan-summary">{plan.summary}</p>
      <ol>{plan.operations.map((operation, index) => <li key={`${message.id}-${operation.kind}-${index}`}>
        <details className="agent-plan-operation">
          <summary><span>{operationTitle(operation)}</span><span>{'tabIds' in operation ? `${operation.tabIds.length} tabs` : 'group change'}</span></summary>
          <div className="agent-plan-operation-content">
            <p className="agent-plan-reason">{operation.reason}</p>
            {'tabs' in operation && operation.tabs?.length ? <ul className="agent-plan-tabs">{operation.tabs.map((tab) => <li key={`${message.id}-${tab.tabId}`}><span className="agent-plan-tab-title">{tab.title}</span>{tab.groupTitle ? <small>原分组：{tab.groupTitle}</small> : null}{tab.url ? <small>{tab.url}</small> : null}</li>)}</ul> : ('tabIds' in operation ? <p className="agent-plan-tab-fallback">Tab IDs: {operation.tabIds.join(', ')}</p> : null)}
          </div>
        </details>
      </li>)}</ol>
      {message.planState === 'pending' ? <button className="primary-button" type="button" onClick={() => void onApply(plan, message.id)}>Apply changes</button> : null}
      {message.planState === 'applying' ? <p className="agent-plan-status">Applying…</p> : null}
      {message.planState === 'applied' ? <p className="agent-plan-status">Changes applied.</p> : null}
      {message.planState === 'partially-applied' ? <div className="agent-plan-status agent-plan-status-partial"><p>Some operations were skipped or failed; available operations continued.</p><ul>{message.planResult?.results.filter((result) => result.status !== 'succeeded' || result.message).map((result) => <li key={`${message.id}-result-${result.operationIndex}`}><strong>{operationTitle(plan.operations[result.operationIndex] ?? plan.operations[0])}</strong>{result.message ? `：${result.message}` : ''}</li>)}</ul></div> : null}
      {message.planState === 'failed' ? <p className="agent-plan-status agent-plan-status-error">The proposal could not be applied. Check the console for the detailed failure.</p> : null}
    </div>
  </details>;
}

export function OrganizerAgentPanel({ view, api }: { view: BrowserSnapshotView; api: BrowserTabsApi | undefined }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [historyReady, setHistoryReady] = useState(false);
  const hydrated = useRef(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const agentApi = useRef(createBrowserCommandClient({ source: 'agent' })).current;
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    void loadAgentChat().then((saved) => {
      if (!active) return;
      setMessages(saved);
      hydrated.current = true;
      setHistoryReady(true);
    }).catch((cause) => {
      console.error('[Tab Group Manager] Unable to load Agent chat history.', cause);
      if (active) {
        hydrated.current = true;
        setHistoryReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      void saveAgentChat(messages).catch((cause) => console.error('[Tab Group Manager] Unable to save Agent chat history.', cause));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [messages]);

  async function startNewConversation() {
    if (!historyReady || sending) return;
    const hasPendingPlan = messages.some((message) => message.planState === 'pending' || message.planState === 'applying');
    if (messages.length > 0) {
      const message = hasPendingPlan
        ? 'A pending Agent proposal will be discarded. Start a new conversation anyway?'
        : 'Clear this conversation and start a new one?';
      if (!window.confirm(message)) return;
    }
    controller.current?.abort();
    try {
      await clearAgentChat();
      setMessages([]);
      setError(undefined);
    } catch (cause) {
      console.error('[Tab Group Manager] Unable to start a new Agent conversation.', cause);
      setError(cause instanceof Error ? cause.message : 'Unable to start a new conversation.');
    }
  }

  async function sendMessage() {
    const text = prompt.trim();
    if (!text || !api || sending || !historyReady) return;
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
    const compactedMessages = compactPreviousToolActivity(messages);
    const nextMessages = [...compactedMessages, userMessage];
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
        await applyPlan(result.plan, assistantId);
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

  async function applyPlan(plan: AgentPlan, messageId: string | undefined): Promise<NonNullable<ChatMessage['planState']>> {
    if (!api) return 'failed';
    setError(undefined);
    setMessages((current) => messageId ? current.map((message) => message.id === messageId ? { ...message, planState: 'applying' } : message) : current);
    try {
      const connection = await loadAgentConnection();
      if (!connection?.apiKey) throw new Error('Agent connection is no longer configured.');
      const confirmation = issueAgentConfirmation(plan, connection.configId);
      const result = await applyAgentPlan(agentApi, plan, { confirmation, configId: connection.configId, confirmHighRisk: true });
      const planState: NonNullable<ChatMessage['planState']> = result.status === 'succeeded' ? 'applied' : result.status === 'partially-applied' ? 'partially-applied' : 'failed';
      const planResult: AgentApplyResult['results'] = result.results;
      setMessages((current) => messageId ? current.map((message) => message.id === messageId ? { ...message, planState, planResult: { status: result.status, results: planResult } } : message) : current);
      return planState;
    } catch (cause) {
      console.error('[Tab Group Manager] Unable to apply Agent proposal.', { planId: plan.planId, cause });
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
      <div className="agent-panel-header-actions">
        <button aria-label="Start a new Agent conversation" className="icon-button" type="button" onClick={() => void startNewConversation()} disabled={!historyReady || sending} title="New conversation"><MessageSquarePlus aria-hidden="true" size={17} /></button>
        <button aria-label="Open Agent settings" className="icon-button" type="button" onClick={() => setSettingsOpen(true)} title="Agent settings"><Settings aria-hidden="true" size={17} /></button>
      </div>
    </header>
    <div className="agent-chat" aria-live="polite">
      {!historyReady ? <p className="agent-chat-status" role="status">Loading conversation…</p> : null}
      {historyReady && messages.length === 0 ? <p className="agent-chat-empty">Ask me to find, filter, or organize tabs. I can ask follow-up questions before proposing any browser changes.</p> : null}
      {messages.map((message) => <article className={`agent-message agent-message-${message.role}`} key={message.id}>
        <div className="agent-message-role">{message.role === 'user' ? 'You' : 'Agent'}</div>
        {message.text && !message.plan ? <p>{message.text}</p> : null}
        {message.role === 'assistant' && message.toolCalls?.map((toolCall) => <AgentToolCallItem key={toolCall.id} toolCall={toolCall} open={Boolean(message.streaming || message.error)} />)}
        {message.error ? <p className="agent-message-error" role="alert">{message.error}</p> : null}
        {message.plan ? <AgentPlanDetails message={message} plan={message.plan} onApply={applyPlan} /> : null}
      </article>)}
      {sending ? <p className="agent-chat-status" role="status">Agent is thinking…</p> : null}
    </div>
    {error ? <p className="agent-error" role="alert">{error}</p> : null}
    <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
      <label className="visually-hidden" htmlFor="agent-composer-input">Message Organizer Agent</label>
      <textarea ref={composerRef} id="agent-composer-input" aria-label="Message Organizer Agent" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Ask about your tabs…" rows={3} disabled={sending || !historyReady} />
      <div className="agent-composer-actions">
        <span className="agent-composer-hint">Enter to send · Shift+Enter for a new line</span>
        {sending ? <button aria-label="Cancel Agent response" className="secondary-button" type="button" onClick={() => controller.current?.abort()}><Square aria-hidden="true" size={14} /> Cancel</button> : <button aria-label="Send message" className="primary-button" type="submit" disabled={!prompt.trim() || !api || !historyReady}><Send aria-hidden="true" size={14} /> Send</button>}
      </div>
    </form>
  </aside>;
}
