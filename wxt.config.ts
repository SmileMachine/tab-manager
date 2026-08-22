import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab Group Manager',
    description: 'Search, move, and organize native Chrome and Edge tab groups across windows.',
    version: '0.1.0',
    action: {
      default_title: 'Tab Group Manager'
    },
    permissions: ['tabs', 'tabGroups', 'storage', 'favicon', 'scripting'],
    optional_host_permissions: ['http://*/*', 'https://*/*']
  }
});
