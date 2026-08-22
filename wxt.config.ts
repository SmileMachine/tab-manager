import { defineConfig } from 'wxt';

import { OPEN_MOVE_CURRENT_TAB_COMMAND } from './src/popup/shortcut';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab Group Manager',
    description: 'Search, move, and organize native Chrome and Edge tab groups across windows.',
    version: '0.1.0',
    action: {
      default_title: 'Tab Group Manager'
    },
    commands: {
      [OPEN_MOVE_CURRENT_TAB_COMMAND]: {
        description: 'Open Move current tab',
        suggested_key: {
          windows: 'Ctrl+Shift+Period',
          mac: 'Command+Shift+Period',
          linux: 'Ctrl+Shift+Period'
        }
      }
    },
    permissions: ['tabs', 'tabGroups', 'storage', 'favicon', 'scripting', 'nativeMessaging'],
    optional_host_permissions: ['http://*/*', 'https://*/*']
  }
});
