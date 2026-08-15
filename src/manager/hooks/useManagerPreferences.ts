import { useEffect } from 'react';

import type { WindowScope } from '../../domain/filters';
import type { ContentWidthPreference, DensityPreference } from '../../domain/preferences';
import type { NativeGroupId, NativeWindowId } from '../../domain/types';
import { loadManagerPreferences, saveManagerPreferences } from '../../infrastructure/preferencesStorage';

export function useLoadManagerPreferences({
  setCollapsedGroupIds,
  setCollapsedWindowIds,
  setContentWidth,
  setDensity,
  enabled,
  onLoaded,
  setWindowNames,
  setWindowScope
}: {
  enabled: boolean;
  onLoaded: () => void;
  setCollapsedGroupIds: (value: Set<NativeGroupId>) => void;
  setCollapsedWindowIds: (value: Set<NativeWindowId>) => void;
  setContentWidth: (value: ContentWidthPreference) => void;
  setDensity: (value: DensityPreference) => void;
  setWindowNames: (value: Record<NativeWindowId, string>) => void;
  setWindowScope: (value: WindowScope) => void;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    loadManagerPreferences().then((preferences) => {
      setDensity(preferences.density);
      setContentWidth(preferences.contentWidth);
      setWindowScope(preferences.windowScope);
      setCollapsedGroupIds(new Set(preferences.collapsedGroupIds));
      setCollapsedWindowIds(new Set(preferences.collapsedWindowIds));
      setWindowNames(preferences.windowNames);
      onLoaded();
    });
  }, [enabled, onLoaded, setCollapsedGroupIds, setCollapsedWindowIds, setContentWidth, setDensity, setWindowNames, setWindowScope]);
}

export function useSaveManagerPreferences({
  collapsedGroupIds,
  collapsedWindowIds,
  contentWidth,
  density,
  enabled,
  windowNames,
  windowScope
}: {
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  collapsedWindowIds: ReadonlySet<NativeWindowId>;
  contentWidth: ContentWidthPreference;
  density: DensityPreference;
  enabled: boolean;
  windowNames: Record<NativeWindowId, string>;
  windowScope: WindowScope;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    saveManagerPreferences({
      contentWidth,
      density,
      windowScope,
      collapsedGroupIds: [...collapsedGroupIds],
      collapsedWindowIds: [...collapsedWindowIds],
      windowNames
    });
  }, [collapsedGroupIds, collapsedWindowIds, contentWidth, density, enabled, windowNames, windowScope]);
}
