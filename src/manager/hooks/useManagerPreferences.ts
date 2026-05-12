import { useEffect } from 'react';

import type { WindowScope } from '../../domain/filters';
import type { ContentWidthPreference, DensityPreference } from '../../domain/preferences';
import type { NativeGroupId, NativeWindowId } from '../../domain/types';
import { loadManagerPreferences, saveManagerPreferences } from '../../infrastructure/preferencesStorage';

export function useLoadManagerPreferences({
  setCollapsedGroupIds,
  setContentWidth,
  setDensity,
  enabled,
  setWindowNames,
  setWindowScope
}: {
  enabled: boolean;
  setCollapsedGroupIds: (value: Set<NativeGroupId>) => void;
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
      setWindowNames(preferences.windowNames);
    });
  }, [enabled, setCollapsedGroupIds, setContentWidth, setDensity, setWindowNames, setWindowScope]);
}

export function useSaveManagerPreferences({
  collapsedGroupIds,
  contentWidth,
  density,
  windowNames,
  windowScope
}: {
  collapsedGroupIds: ReadonlySet<NativeGroupId>;
  contentWidth: ContentWidthPreference;
  density: DensityPreference;
  windowNames: Record<NativeWindowId, string>;
  windowScope: WindowScope;
}) {
  useEffect(() => {
    saveManagerPreferences({
      contentWidth,
      density,
      windowScope,
      collapsedGroupIds: [...collapsedGroupIds],
      windowNames
    });
  }, [collapsedGroupIds, contentWidth, density, windowNames, windowScope]);
}
