import type { AgentToolActivity } from './runtime';
import type { AgentApplyResult } from './executor';
import type { AgentPlan } from './plan';
import {
  createConfigId,
  defaultAgentPrivacySettings,
  publicConnection,
  validateApiKey,
  validateApiRoot,
  validateModelId,
  type AgentConnectionConfig,
  type AgentKeyRetention,
  type AgentPrivacySettings,
  type StoredAgentConnection
} from './config';

const publicConfigKey = 'organizerAgent.connection';
const sessionKey = 'organizerAgent.sessionKey';
const localKey = 'organizerAgent.localKey';
const privacyKey = 'organizerAgent.privacy';
const chatKey = 'organizerAgent.chat';
const MAX_CHAT_MESSAGES = 80;
const MAX_CHAT_TEXT_LENGTH = 20_000;

interface StorageArea {
  get(keys?: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}


export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolActivity[];
  streaming?: boolean;
  error?: string;
  plan?: AgentPlan;
  planState?: 'pending' | 'applying' | 'applied' | 'partially-applied' | 'failed';
  planResult?: Pick<AgentApplyResult, 'status' | 'results'>;
}

export interface AgentStorageAreas {
  local: StorageArea;
  session: StorageArea;
}

export function browserAgentStorage(): AgentStorageAreas | undefined {
  if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.storage?.session) return undefined;
  return { local: chrome.storage.local, session: chrome.storage.session };
}

export async function loadAgentConnection(areas = browserAgentStorage()): Promise<StoredAgentConnection | undefined> {
  if (!areas) return undefined;
  const publicResult = await areas.local.get(publicConfigKey);
  const publicConfig = parsePublicConfig(publicResult[publicConfigKey]);
  if (!publicConfig) return undefined;
  const keyResult = await (publicConfig.keyRetention === 'local' ? areas.local : areas.session).get(
    publicConfig.keyRetention === 'local' ? localKey : sessionKey
  );
  const keyName = publicConfig.keyRetention === 'local' ? localKey : sessionKey;
  const apiKey = typeof keyResult[keyName] === 'string' ? keyResult[keyName] : undefined;
  return { ...publicConfig, apiKey, hasApiKey: Boolean(apiKey) };
}

export async function saveAgentConnection(
  input: { apiRoot: string; modelId: string; apiKey: string; keyRetention?: AgentKeyRetention },
  areas = browserAgentStorage()
): Promise<AgentConnectionConfig> {
  if (!areas) throw new Error('Agent storage is unavailable.');
  const apiRoot = validateApiRoot(input.apiRoot);
  const modelId = validateModelId(input.modelId);
  const apiKey = validateApiKey(input.apiKey);
  const keyRetention = input.keyRetention ?? 'local';
  const previous = await loadAgentConnection(areas);
  const configId = createConfigId(apiRoot, modelId, apiKey);

  await areas.local.set({
    [publicConfigKey]: { apiRoot, modelId, configId, keyRetention }
  });
  await areas.session.remove(sessionKey);
  await areas.local.remove(localKey);
  await (keyRetention === 'local' ? areas.local : areas.session).set({
    [keyRetention === 'local' ? localKey : sessionKey]: apiKey
  });

  // `previous` is intentionally read only to make the rebinding rule explicit:
  // saving a new root/model/key always creates a new configuration identity.
  void previous;
  return { apiRoot, modelId, configId, hasApiKey: true, keyRetention };
}

export async function deleteAgentConnection(areas = browserAgentStorage()): Promise<void> {
  if (!areas) return;
  await areas.local.remove([publicConfigKey, localKey]);
  await areas.session.remove(sessionKey);
}

export async function loadAgentChat(areas = browserAgentStorage()): Promise<AgentChatMessage[]> {
  if (!areas) return [];
  const result = await areas.local.get(chatKey);
  return parseChatMessages(result[chatKey]);
}

export async function saveAgentChat(messages: AgentChatMessage[], areas = browserAgentStorage()): Promise<void> {
  if (!areas) return;
  const records = messages.slice(-MAX_CHAT_MESSAGES).map((message) => ({
    ...message,
    text: message.text.slice(0, MAX_CHAT_TEXT_LENGTH),
    error: message.error?.slice(0, 1000),
    toolCalls: message.toolCalls?.map(({ id, name, status, summary }) => ({ id, name, status, ...(summary ? { summary: summary.slice(0, 160) } : {}) })),
    streaming: false,
    ...(message.streaming && !message.error ? { error: 'Agent request was interrupted by a page refresh.' } : {})
  }));
  await areas.local.set({ [chatKey]: records });
}

export async function clearAgentChat(areas = browserAgentStorage()): Promise<void> {
  if (!areas) return;
  await areas.local.remove(chatKey);
}

export async function loadAgentPrivacySettings(areas = browserAgentStorage()): Promise<AgentPrivacySettings> {
  if (!areas) return defaultAgentPrivacySettings;
  const result = await areas.local.get(privacyKey);
  const value = result[privacyKey];
  if (!value || typeof value !== 'object') return defaultAgentPrivacySettings;
  const record = value as { allowPageContent?: unknown; allowAutomaticChanges?: unknown };
  return {
    allowPageContent: record.allowPageContent === true,
    allowAutomaticChanges: record.allowAutomaticChanges === true
  };
}

export async function saveAgentPrivacySettings(
  settings: AgentPrivacySettings,
  areas = browserAgentStorage()
): Promise<void> {
  if (!areas) return;
  await areas.local.set({ [privacyKey]: { allowPageContent: settings.allowPageContent === true, allowAutomaticChanges: settings.allowAutomaticChanges === true } });
}

function parseChatMessages(value: unknown): AgentChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== 'string' || (record.role !== 'user' && record.role !== 'assistant') || typeof record.text !== 'string') return [];
    const toolCalls = Array.isArray(record.toolCalls) ? record.toolCalls.flatMap((tool) => {
      if (!tool || typeof tool !== 'object') return [];
      const value = tool as Record<string, unknown>;
      if (typeof value.id !== 'string' || typeof value.name !== 'string' || !['running', 'completed', 'failed'].includes(String(value.status))) return [];
      return [{
        id: value.id,
        name: value.name,
        status: value.status as AgentToolActivity['status'],
        ...(typeof value.summary === 'string' ? { summary: value.summary.slice(0, 160) } : {})
      }];
    }) : undefined;
    const planState = ['pending', 'applying', 'applied', 'partially-applied', 'failed'].includes(String(record.planState)) ? record.planState as AgentChatMessage['planState'] : undefined;
    const planResult = isStoredPlanResult(record.planResult) ? record.planResult : undefined;
    return [{
      id: record.id,
      role: record.role as AgentChatMessage['role'],
      text: record.text.slice(0, MAX_CHAT_TEXT_LENGTH),
      toolCalls,
      streaming: false,
      error: typeof record.error === 'string' ? record.error.slice(0, 1000) : undefined,
      plan: isStoredPlan(record.plan) ? record.plan : undefined,
      planState,
      planResult
    }];
  }).slice(-MAX_CHAT_MESSAGES);
}


function isStoredPlanResult(value: unknown): value is NonNullable<AgentChatMessage['planResult']> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!['succeeded', 'partially-applied', 'failed'].includes(String(record.status)) || !Array.isArray(record.results)) return false;
  return record.results.every((result) => {
    if (!result || typeof result !== 'object') return false;
    const item = result as Record<string, unknown>;
    return typeof item.operationIndex === 'number' && Number.isInteger(item.operationIndex) && typeof item.kind === 'string' && ['succeeded', 'skipped', 'failed'].includes(String(item.status)) &&
      (item.message === undefined || typeof item.message === 'string');
  });
}

function isStoredPlan(value: unknown): value is AgentPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<AgentPlan>;
  return typeof plan.planId === 'string' && typeof plan.planHash === 'string' && typeof plan.baseRevision === 'string' &&
    typeof plan.baseRevisionInput === 'string' && Array.isArray(plan.contextTabIds) && Array.isArray(plan.operations) &&
    typeof plan.summary === 'string' && typeof plan.highRisk === 'boolean' && typeof plan.crossWindow === 'boolean';
}

function parsePublicConfig(value: unknown): Omit<StoredAgentConnection, 'apiKey'> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.apiRoot !== 'string' || typeof record.modelId !== 'string' || typeof record.configId !== 'string') return undefined;
  try {
    return {
      apiRoot: validateApiRoot(record.apiRoot),
      modelId: validateModelId(record.modelId),
      configId: record.configId,
      keyRetention: record.keyRetention === 'local' ? 'local' : 'session',
      hasApiKey: false
    };
  } catch {
    return undefined;
  }
}

export function redactAgentError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return 'The Agent request failed.';
}

export function publicAgentConnection(connection: StoredAgentConnection | undefined): AgentConnectionConfig | undefined {
  return publicConnection(connection);
}
