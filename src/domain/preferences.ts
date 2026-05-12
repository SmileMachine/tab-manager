import type { WindowScope } from './filters';
import type { NativeGroupId, NativeWindowId } from './types';

export type DensityPreference = 'comfortable' | 'compact';
export type ContentWidthPreference = 'full' | 'readable';

export interface ManagerPreferences {
  contentWidth: ContentWidthPreference;
  density: DensityPreference;
  windowScope: WindowScope;
  collapsedGroupIds: NativeGroupId[];
  windowNames: Record<NativeWindowId, string>;
}

export const defaultPreferences: ManagerPreferences = {
  contentWidth: 'full',
  density: 'comfortable',
  windowScope: { kind: 'current' },
  collapsedGroupIds: [],
  windowNames: {}
};

export function normalizePreferences(value: unknown): ManagerPreferences {
  if (!isRecord(value)) {
    return defaultPreferences;
  }

  return {
    contentWidth:
      value.contentWidth === 'readable' || value.contentWidth === 'full'
        ? value.contentWidth
        : defaultPreferences.contentWidth,
    density: value.density === 'compact' || value.density === 'comfortable' ? value.density : defaultPreferences.density,
    windowScope: normalizeWindowScope(value.windowScope),
    collapsedGroupIds: Array.isArray(value.collapsedGroupIds)
      ? value.collapsedGroupIds.filter((groupId): groupId is number => typeof groupId === 'number')
      : [],
    windowNames: normalizeWindowNames(value.windowNames)
  };
}

function normalizeWindowNames(value: unknown): Record<NativeWindowId, string> {
  if (!isRecord(value) || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([windowId, name]) => {
      const id = Number(windowId);
      const trimmedName = typeof name === 'string' ? name.trim() : '';

      return Number.isFinite(id) && trimmedName ? [[id, trimmedName]] : [];
    })
  );
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
