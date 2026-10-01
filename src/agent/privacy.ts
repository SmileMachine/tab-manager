import { loadAgentPrivacySettings } from './storage';

export const PAGE_CONTENT_TOOL_NAME = 'inspect_page_content';

/** Local executor guard used before any tabs.get, permission check, or script injection. */
export async function assertPageContentToolEnabled(): Promise<void> {
  if (!(await loadAgentPrivacySettings()).allowPageContent) {
    throw new Error('privacy-tool-disabled');
  }
}
