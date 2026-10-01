import type { BrowserTabGroupColor, BrowserSnapshot, NativeGroupId, NativeTabId, NativeWindowId } from '../domain/types';
import type { OperationSource } from '../codex/protocol';

export type BrowserCommand =
  | { kind: 'loadSnapshot' }
  | { kind: 'groupTabs'; tabIds: NativeTabId[]; targetGroupId: NativeGroupId }
  | { kind: 'activateTab'; tabId: NativeTabId; windowId: NativeWindowId }
  | { kind: 'closeTabs'; tabIds: NativeTabId[] }
  | { kind: 'createTabs'; tabs: Array<{ windowId?: NativeWindowId; index?: number; url?: string; pinned?: boolean; active?: boolean }> }
  | { kind: 'createWindow'; options?: { type?: 'normal' | 'popup' | 'panel'; incognito?: boolean; state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' } }
  | { kind: 'updateWindow'; windowId: NativeWindowId; changes: { state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' } }
  | { kind: 'createGroup'; tabIds: NativeTabId[]; windowId: NativeWindowId; title: string; color: BrowserTabGroupColor }
  | { kind: 'discardTabs'; tabIds: NativeTabId[] }
  | { kind: 'moveGroup'; groupId: NativeGroupId; targetWindowId: NativeWindowId; targetIndex: number }
  | { kind: 'moveTab'; tabId: NativeTabId; targetWindowId: NativeWindowId; targetIndex: number }
  | { kind: 'moveTabs'; tabIds: NativeTabId[]; targetWindowId: NativeWindowId; targetIndex: number }
  | { kind: 'moveTabsToGroup'; tabIds: NativeTabId[]; targetGroupId: NativeGroupId; targetWindowId: NativeWindowId }
  | { kind: 'moveTabToGroup'; tabId: NativeTabId; targetGroupId: NativeGroupId; targetWindowId?: NativeWindowId }
  | { kind: 'ungroupTabs'; tabIds: NativeTabId[] }
  | { kind: 'updateTab'; tabId: NativeTabId; changes: { url?: string; pinned?: boolean; muted?: boolean; autoDiscardable?: boolean } }
  | { kind: 'updateGroup'; groupId: NativeGroupId; changes: { title?: string; color?: BrowserTabGroupColor; collapsed?: boolean } };

export interface BrowserCommandMessage {
  type: 'browser-command';
  requestId: string;
  action: 'execute' | 'acquire' | 'release';
  command?: BrowserCommand;
  lockToken?: string;
  source?: OperationSource;
}

export interface BrowserCommandResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export function isBrowserCommandMessage(value: unknown): value is BrowserCommandMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrowserCommandMessage>;
  return candidate.type === 'browser-command' && typeof candidate.requestId === 'string' &&
    (candidate.action === 'execute' || candidate.action === 'acquire' || candidate.action === 'release');
}

export function isBrowserCommand(value: unknown): value is BrowserCommand {
  return Boolean(value) && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string' && [
    'loadSnapshot', 'groupTabs', 'activateTab', 'closeTabs', 'createTabs', 'createWindow', 'updateWindow',
    'createGroup', 'discardTabs', 'moveGroup', 'moveTab', 'moveTabs', 'moveTabsToGroup', 'moveTabToGroup',
    'ungroupTabs', 'updateTab', 'updateGroup'
  ].includes((value as { kind: string }).kind);
}

export function isBrowserSnapshot(value: unknown): value is BrowserSnapshot {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as BrowserSnapshot).windows) &&
    Array.isArray((value as BrowserSnapshot).tabs) && Array.isArray((value as BrowserSnapshot).groups);
}

export function browserCommandResult<T>(response: BrowserCommandResponse): T {
  if (!response.ok) throw new Error(response.error ?? 'Browser command failed.');
  return response.result as T;
}
