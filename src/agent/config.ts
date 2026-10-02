export type AgentKeyRetention = 'session' | 'local';

export interface AgentConnectionConfig {
  apiRoot: string;
  modelId: string;
  configId: string;
  hasApiKey: boolean;
  keyRetention?: AgentKeyRetention;
}

export interface StoredAgentConnection extends AgentConnectionConfig {
  apiKey?: string;
}

export interface AgentPrivacySettings {
  allowPageContent: boolean;
  allowAutomaticChanges: boolean;
}

export const defaultAgentPrivacySettings: AgentPrivacySettings = {
  allowPageContent: false,
  allowAutomaticChanges: false
};

export function validateApiRoot(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('API root is required.');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('API root must be a valid HTTPS URL.');
  }

  if (url.protocol !== 'https:') throw new Error('API root must use HTTPS.');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('API root cannot contain credentials, query parameters, or a fragment.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname === '/responses' || pathname.endsWith('/responses')) {
    throw new Error('Enter the API root, not the `/responses` resource URL.');
  }
  url.pathname = pathname || '/';
  return url.toString().replace(/\/$/, '');
}

export function validateModelId(value: string): string {
  const modelId = value.trim();
  if (!modelId || modelId.length > 200 || /[\r\n]/.test(modelId)) {
    throw new Error('Model ID is required and must be a single short line.');
  }
  return modelId;
}

export function validateApiKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 4096 || /[\r\n]/.test(key)) throw new Error('API key is required.');
  return key;
}

export function originPermissionForApiRoot(apiRoot: string): string {
  const url = new URL(validateApiRoot(apiRoot));
  return `${url.origin}/*`;
}

export function responsesUrl(apiRoot: string): string {
  return `${validateApiRoot(apiRoot)}/responses`;
}

export function createConfigId(apiRoot: string, modelId: string, key: string): string {
  return `agent-config:${fnv1a64(`${validateApiRoot(apiRoot)}\u0000${validateModelId(modelId)}\u0000${key}`)}`;
}

export function publicConnection(config: StoredAgentConnection | undefined): AgentConnectionConfig | undefined {
  if (!config) return undefined;
  return {
    apiRoot: config.apiRoot,
    modelId: config.modelId,
    configId: config.configId,
    hasApiKey: Boolean(config.apiKey),
    keyRetention: config.keyRetention
  };
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
