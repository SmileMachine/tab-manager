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

interface StorageArea {
  get(keys?: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
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
  return { ...publicConfig, apiKey };
}

export async function saveAgentConnection(
  input: { apiRoot: string; modelId: string; apiKey: string; keyRetention?: AgentKeyRetention },
  areas = browserAgentStorage()
): Promise<AgentConnectionConfig> {
  if (!areas) throw new Error('Agent storage is unavailable.');
  const apiRoot = validateApiRoot(input.apiRoot);
  const modelId = validateModelId(input.modelId);
  const apiKey = validateApiKey(input.apiKey);
  const keyRetention = input.keyRetention ?? 'session';
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

export async function loadAgentPrivacySettings(areas = browserAgentStorage()): Promise<AgentPrivacySettings> {
  if (!areas) return defaultAgentPrivacySettings;
  const result = await areas.local.get(privacyKey);
  const value = result[privacyKey];
  return value && typeof value === 'object' && (value as { allowPageContent?: unknown }).allowPageContent === true
    ? { allowPageContent: true }
    : defaultAgentPrivacySettings;
}

export async function saveAgentPrivacySettings(
  settings: AgentPrivacySettings,
  areas = browserAgentStorage()
): Promise<void> {
  if (!areas) return;
  await areas.local.set({ [privacyKey]: { allowPageContent: settings.allowPageContent === true } });
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
