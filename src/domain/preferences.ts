import type { WindowScope } from './filters';
import type { NativeGroupId } from './types';

export type DensityPreference = 'comfortable' | 'compact';

export interface ManagerPreferences {
  density: DensityPreference;
  windowScope: WindowScope;
  collapsedGroupIds: NativeGroupId[];
}

export const defaultPreferences: ManagerPreferences = {
  density: 'comfortable',
  windowScope: { kind: 'current' },
  collapsedGroupIds: []
};

export function normalizePreferences(value: unknown): ManagerPreferences {
  if (!isRecord(value)) {
    return defaultPreferences;
  }

  return {
    density: value.density === 'compact' || value.density === 'comfortable' ? value.density : defaultPreferences.density,
    windowScope: normalizeWindowScope(value.windowScope),
    collapsedGroupIds: Array.isArray(value.collapsedGroupIds)
      ? value.collapsedGroupIds.filter((groupId): groupId is number => typeof groupId === 'number')
      : []
  };
}

function normalizeWindowScope(value: unknown): WindowScope {
  if (!isRecord(value)) {
    return defaultPreferences.windowScope;
  }

  if (value.kind === 'all' || value.kind === 'current') {
    return { kind: value.kind };
  }

  if (value.kind === 'window' && typeof value.windowId === 'number') {
    return { kind: 'window', windowId: value.windowId };
  }

  return defaultPreferences.windowScope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
