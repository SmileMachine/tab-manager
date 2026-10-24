import { defineBackground } from 'wxt/utils/define-background';

import { startDevelopmentControl } from '../src/development/nativeControl';
import { registerBackgroundListeners } from '../src/background/index';

export default defineBackground(() => {
  registerBackgroundListeners();
  if (__TAB_GROUP_LOCAL_RUNTIME__) {
    startDevelopmentControl(__TAB_GROUP_LOCAL_RUNTIME__);
  }
});
