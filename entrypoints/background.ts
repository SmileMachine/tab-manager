import { defineBackground } from 'wxt/utils/define-background';

import { registerBackgroundListeners } from '../src/background/index';

export default defineBackground(() => {
  registerBackgroundListeners();
});
