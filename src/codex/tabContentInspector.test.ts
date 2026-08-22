import { afterEach, describe, expect, it, vi } from 'vitest';

import { createChromeTabContentInspector, extractPageEvidence } from './tabContentInspector';

afterEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  vi.unstubAllGlobals();
});

describe('extractPageEvidence', () => {
  it('returns compact semantic evidence without hidden or form content', () => {
    document.documentElement.lang = 'zh-CN';
    document.title = 'Research notes';
    document.body.innerHTML = `
      <nav>Navigation that should not be returned</nav>
      <main>
        <article>
          <h1>Browser grouping design</h1>
          <p>This paragraph explains how operation history supports restoring a previous tab arrangement.</p>
          <p>Additional context about snapshots and safe grouping decisions.</p>
          <input value="secret form value" />
          <p hidden>Hidden text that should not be returned.</p>
        </article>
      </main>
      <footer>Footer text that should not be returned</footer>
    `;

    const result = extractPageEvidence({ mode: 'focused', budget: 'compact', focusTerms: ['operation history'] });

    expect(result).toMatchObject({
      contentTrust: 'untrusted-page-data',
      title: 'Research notes',
      language: 'zh-CN',
      pageKind: 'article',
      headings: [{ level: 1, text: 'Browser grouping design' }]
    });
    expect(result.snippets?.join(' ')).toContain('operation history');
    expect(result.snippets?.join(' ')).not.toContain('secret form value');
    expect(result.snippets?.join(' ')).not.toContain('Navigation');
    expect(result.estimatedTokens).toBeLessThanOrEqual(250);
    expect(result.contentHash).toMatch(/^fnv1a64:/);
  });

  it('uses a short introductory excerpt when focused terms have no match', () => {
    document.title = 'Plain page';
    document.body.innerHTML = '<main><p>This is the first useful paragraph for grouping context.</p><p>This is a second paragraph.</p></main>';

    const result = extractPageEvidence({ mode: 'focused', budget: 'compact', focusTerms: ['unmatched topic'] });

    expect(result.snippets).toEqual(['This is the first useful paragraph for grouping context.']);
    expect(result.truncated).toBe(true);
  });
});

describe('createChromeTabContentInspector', () => {
  it('returns a typed unsupported-page result without requesting permissions', async () => {
    const get = vi.fn((_tabId: number, done: (tab: chrome.tabs.Tab) => void) =>
      done({ id: 1, windowId: 1, index: 0, url: 'chrome://settings', discarded: false } as chrome.tabs.Tab)
    );
    const contains = vi.fn();
    vi.stubGlobal('chrome', { tabs: { get }, permissions: { contains }, runtime: { lastError: undefined } });

    const result = await createChromeTabContentInspector().inspectTab(1);

    expect(result).toEqual({ status: 'unsupported-page', tabId: 1, message: 'The chrome: page cannot be inspected.' });
    expect(contains).not.toHaveBeenCalled();
  });

  it('returns a permission-required result before injecting page code', async () => {
    const get = vi.fn((_tabId: number, done: (tab: chrome.tabs.Tab) => void) =>
      done({ id: 2, windowId: 1, index: 0, url: 'https://example.test/page', discarded: false } as chrome.tabs.Tab)
    );
    const contains = vi.fn((_details: chrome.permissions.Permissions, done: (result: boolean) => void) => done(false));
    const executeScript = vi.fn();
    vi.stubGlobal('chrome', {
      tabs: { get },
      permissions: { contains },
      scripting: { executeScript },
      runtime: { lastError: undefined }
    });

    const result = await createChromeTabContentInspector().inspectTab(2);

    expect(result).toMatchObject({ status: 'permission-required', tabId: 2, origin: 'https://example.test' });
    expect(executeScript).not.toHaveBeenCalled();
  });
});
