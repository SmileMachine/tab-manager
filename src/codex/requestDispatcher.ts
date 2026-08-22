import type { BrowserTabsApi } from '../infrastructure/browserTabsApi';
import type { TabContentInspector } from './tabContentInspector';
import { BrowserEventCursor } from './eventCursor';
import { OperationJournal } from './operationJournal';
import { handleCodexImportRequest, isCodexImportMethod } from './importService';
import { handleCodexReadRequest } from './readService';
import { handleCodexRollbackRequest, isCodexRollbackMethod } from './rollbackService';
import { CODEX_PROTOCOL_VERSION, createRpcError, isCodexRpcRequest, type CodexRpcResponse } from './protocol';
import { CODEX_WRITE_METHODS, handleCodexWriteRequest, isCodexWriteMethod } from './writeService';

export interface CodexRequestServices {
  api: BrowserTabsApi;
  journal: OperationJournal;
  contentInspector: TabContentInspector;
  eventCursor: BrowserEventCursor;
}

export function createCodexRequestDispatcher(services: CodexRequestServices) {
  return (request: unknown): Promise<CodexRpcResponse<unknown>> => dispatchCodexRequest(request, services);
}

export async function dispatchCodexRequest(
  request: unknown,
  services: CodexRequestServices
): Promise<CodexRpcResponse<unknown>> {
  if (!isCodexRpcRequest(request)) {
    return createRpcError(requestIdOf(request), {
      code: 'invalid-request',
      message: 'The request is not a valid Codex JSON-RPC request.'
    });
  }

  if (isCodexRollbackMethod(request.method)) {
    return handleCodexRollbackRequest(request, services);
  }

  if (isCodexImportMethod(request.method)) {
    return handleCodexImportRequest(request, services);
  }

  if (isCodexWriteMethod(request.method)) {
    return handleCodexWriteRequest(request, services);
  }

  return handleCodexReadRequest(
    request,
    services.api,
    services.journal,
    services.contentInspector,
    CODEX_WRITE_METHODS,
    services.eventCursor
  );
}

function requestIdOf(value: unknown): string {
  return isRecord(value) && typeof value.requestId === 'string' ? value.requestId : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const CODEX_DISPATCH_PROTOCOL_VERSION = CODEX_PROTOCOL_VERSION;
