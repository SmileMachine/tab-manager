import { originPermissionForApiRoot, responsesUrl, type StoredAgentConnection } from './config';
import { loadAgentConnection, redactAgentError } from './storage';

export type AgentConnectionCheckKind = 'basic' | 'capability';

export interface AgentConnectionCheckResult {
  kind: AgentConnectionCheckKind;
  ok: boolean;
  message: string;
}

export async function requestAgentHostPermission(apiRoot: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return;
  const granted = await chrome.permissions.request({ origins: [originPermissionForApiRoot(apiRoot)] });
  if (!granted) throw new Error('Permission to contact the configured Agent endpoint was denied.');
}

export async function checkAgentConnection(
  kind: AgentConnectionCheckKind,
  connection: StoredAgentConnection | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<AgentConnectionCheckResult> {
  connection ??= await loadAgentConnection();
  if (!connection?.apiKey) return { kind, ok: false, message: 'Configure an Agent endpoint and key first.' };
  await requestAgentHostPermission(connection.apiRoot);
  try {
    const firstInput = [{ role: 'user', content: [{ type: 'input_text', text: kind === 'basic' ? 'Reply with the single word OK.' : 'Call the synthetic capability_check function exactly once.' }] }];
    const first = await requestResponses(connection, {
      model: connection.modelId,
      input: firstInput,
      ...(kind === 'capability' ? { tools: [{ type: 'function', name: 'capability_check', description: 'Synthetic capability test. Never reads browser data.', parameters: { type: 'object', properties: {}, additionalProperties: false } }] } : {}),
      store: false,
      stream: kind === 'capability',
      ...(kind === 'capability' ? { tool_choice: { type: 'function', name: 'capability_check' }, parallel_tool_calls: false } : {})
    }, fetchImpl);
    if (kind === 'basic') return { kind, ok: true, message: 'Basic Responses connection succeeded.' };

    const call = findFunctionCall(first);
    if (!call) return { kind, ok: false, message: 'The endpoint did not return a synthetic function call. It may not support Responses function tools or may have returned an incompatible response shape.' };
    const second = await requestResponses(connection, {
      model: connection.modelId,
      input: [
        ...firstInput,
        { type: 'function_call', call_id: call.callId, name: call.name, arguments: call.arguments },
        { type: 'function_call_output', call_id: call.callId, output: JSON.stringify({ ok: true }) }
      ],
      store: false,
      stream: true
    }, fetchImpl);
    if (!second.trim()) return { kind, ok: false, message: 'The endpoint did not complete the synthetic function-result round trip.' };
    return { kind, ok: true, message: 'Synthetic tool call and function-result round trip succeeded.' };
  } catch (error) {
    return { kind, ok: false, message: redactAgentError(error) };
  }
}

async function requestResponses(connection: StoredAgentConnection, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(responsesUrl(connection.apiRoot), {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${connection.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Endpoint returned HTTP ${response.status}.`);
  return response.text();
}

interface SyntheticFunctionCall {
  callId: string;
  name: string;
  arguments: string;
}

function findFunctionCall(body: string): SyntheticFunctionCall | undefined {
  const candidates = parseJsonLines(body);
  const pending = new Map<string, Partial<SyntheticFunctionCall>>();
  const calls: SyntheticFunctionCall[] = [];

  for (const candidate of candidates) {
    collectFunctionCalls(candidate, pending, calls);
  }
  for (const candidate of pending.values()) {
    if (candidate.callId && candidate.name) {
      calls.push({ callId: candidate.callId, name: candidate.name, arguments: candidate.arguments ?? '{}' });
    }
  }
  return calls.find((call) => call.name === 'capability_check') ?? calls[0];
}

function parseJsonLines(body: string): unknown[] {
  const values: unknown[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'data: [DONE]') continue;
    const source = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!source.startsWith('{') && !source.startsWith('[')) continue;
    try {
      values.push(JSON.parse(source));
    } catch {
      // A streaming provider may split an event across chunks. The full response
      // is parsed below as a fallback when it is a single JSON document.
    }
  }
  if (values.length === 0) {
    try { values.push(JSON.parse(body)); } catch { /* incompatible response body */ }
  }
  return values;
}

function collectFunctionCalls(value: unknown, pending: Map<string, Partial<SyntheticFunctionCall>>, calls: SyntheticFunctionCall[], parentKey?: string): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFunctionCalls(item, pending, calls, parentKey);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const item = record.item && typeof record.item === 'object' ? record.item as Record<string, unknown> : undefined;
  const type = record.type;
  const itemType = item?.type;
  const functionRecord = record.function && typeof record.function === 'object' ? record.function as Record<string, unknown> : undefined;
  const isFunctionCall = type === 'function_call' || itemType === 'function_call' || Boolean(functionRecord && (record.id || record.call_id));
  const source = item && itemType === 'function_call' ? item : functionRecord ?? record;
  const callId = readString(source.call_id) ?? readString(record.call_id) ?? readString(record.id);
  const id = readString(source.id) ?? readString(record.item_id) ?? readString(record.id) ?? parentKey;
  const name = readString(source.name) ?? readString(record.name);
  const args = readString(source.arguments) ?? readString(record.arguments);
  if (isFunctionCall && (callId || id || name)) {
    if (callId && name) calls.push({ callId, name, arguments: args ?? '{}' });
    const key = callId ?? id;
    if (key) {
      pending.set(key, { ...pending.get(key), callId, name, arguments: args });
    }
  } else if (type === 'response.function_call_arguments.done' || type === 'response.function_call_arguments.delta') {
    const key = readString(record.item_id) ?? readString(record.call_id) ?? parentKey;
    if (key) pending.set(key, { ...pending.get(key), callId: readString(record.call_id), arguments: args });
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'item') continue;
    collectFunctionCalls(child, pending, calls, id ?? parentKey);
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
