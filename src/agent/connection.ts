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
      stream: kind === 'capability'
    }, fetchImpl);
    if (kind === 'basic') return { kind, ok: true, message: 'Basic Responses connection succeeded.' };

    const call = findFunctionCall(first);
    if (!call) return { kind, ok: false, message: 'The endpoint did not return a synthetic function call.' };
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

function findFunctionCall(body: string): { callId: string; name: string; arguments: string } | undefined {
  const values = [...body.matchAll(/"call_id"\s*:\s*"([^"]+)"[\s\S]{0,500}?"name"\s*:\s*"([^"]+)"[\s\S]{0,500}?"arguments"\s*:\s*"([^"]*)"/g)];
  const match = values[0];
  return match ? { callId: match[1], name: match[2], arguments: match[3] } : undefined;
}
