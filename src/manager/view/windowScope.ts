import type { WindowScope } from '../../domain/filters';
import type { NativeWindowId } from '../../domain/types';

export function serializeWindowScope(scope: WindowScope) {
  return scope.kind === 'window' ? `window:${scope.windowId}` : scope.kind;
}

export function parseWindowScope(value: string): WindowScope {
  if (value === 'current') {
    return { kind: 'current' };
  }

  if (value === 'all') {
    return { kind: 'all' };
  }

  return { kind: 'window', windowId: Number(value.replace('window:', '')) as NativeWindowId };
}
