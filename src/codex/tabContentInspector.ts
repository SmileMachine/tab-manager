import type { NativeTabId } from '../domain/types';
import type {
  ContentBudgetName,
  ContentInspectionOutcome,
  ContentReadMode,
  ContentReadOptions,
  ContentReadResult
} from './protocol';

const MAX_BATCH_SIZE = 20;

export interface TabContentInspector {
  inspectTab(tabId: NativeTabId, options?: ContentReadOptions): Promise<ContentInspectionOutcome>;
  inspectTabs(tabIds: NativeTabId[], options?: Omit<ContentReadOptions, 'mode'>): Promise<ContentInspectionOutcome[]>;
}

interface PageExtractionOptions {
  mode: ContentReadMode;
  budget: ContentBudgetName;
  maxChars?: number;
  maxSnippets?: number;
  focusTerms?: string[];
}

interface ExtractedPageEvidence extends Omit<ContentReadResult, 'tabId' | 'capturedAt'> {}

export function createChromeTabContentInspector(): TabContentInspector {
  return {
    async inspectTab(tabId, options = {}) {
      const tab = await callChrome<chrome.tabs.Tab>((done) => chrome.tabs.get(tabId, done));
      const unsupported = unsupportedPage(tabId, tab.url ?? tab.pendingUrl, tab.discarded ?? false);
      if (unsupported) {
        return unsupported;
      }

      const url = tab.url ?? tab.pendingUrl!;
      const origin = new URL(url).origin;
      const permitted = await callChrome<boolean>((done) => chrome.permissions.contains({ origins: [originPattern(url)] }, done));
      if (!permitted) {
        return {
          status: 'permission-required',
          tabId,
          origin,
          message: `The extension needs host permission for ${origin}.`
        };
      }

      try {
        const results = await callChrome<chrome.scripting.InjectionResult<ExtractedPageEvidence>[]>((done) =>
          chrome.scripting.executeScript(
            {
              target: { tabId },
              func: extractPageEvidence,
              args: [normalizePageExtractionOptions(options)]
            },
            done
          )
        );
        const evidence = results[0]?.result;

        if (!evidence) {
          return { status: 'injection-failed', tabId, message: 'The page did not return readable content.' };
        }

        return {
          status: 'ok',
          content: {
            ...evidence,
            tabId,
            capturedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        return {
          status: 'injection-failed',
          tabId,
          message: error instanceof Error ? error.message : 'Unable to inject the page-content reader.'
        };
      }
    },
    async inspectTabs(tabIds, options = {}) {
      const uniqueTabIds = [...new Set(tabIds)];
      if (uniqueTabIds.length > MAX_BATCH_SIZE) {
        throw new Error(`inspectTabs accepts at most ${MAX_BATCH_SIZE} tab ids.`);
      }

      const outcomes: ContentInspectionOutcome[] = [];
      for (const tabId of uniqueTabIds) {
        outcomes.push(await this.inspectTab(tabId, { ...options, mode: 'outline' }));
      }
      return outcomes;
    }
  };
}

export function extractPageEvidence(options: PageExtractionOptions): ExtractedPageEvidence {
  const settings = pageExtractionBudget(options);
  const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const isVisible = (element: Element) => {
    const computed = window.getComputedStyle(element);
    return !element.closest('script,style,noscript,nav,footer,aside,form,template,[aria-hidden="true"],[hidden]') &&
      computed.display !== 'none' &&
      computed.visibility !== 'hidden';
  };
  const unique = <T,>(values: T[], key: (value: T) => string) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const valueKey = key(value);
      if (!valueKey || seen.has(valueKey)) return false;
      seen.add(valueKey);
      return true;
    });
  };
  const canonicalUrl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const description = normalize(
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ??
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content
  ) || undefined;
  const headings = unique(
    Array.from(document.querySelectorAll('h1,h2,h3'))
      .filter(isVisible)
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: normalize(element.textContent).slice(0, 180) }))
      .filter((heading) => heading.text),
    (heading) => `${heading.level}:${heading.text.toLocaleLowerCase()}`
  ).slice(0, settings.maxHeadings);
  const root = document.querySelector<HTMLElement>('article,main,[role="main"]') ?? document.body;
  const blocks = unique(
    Array.from(root.querySelectorAll('p,li,blockquote,pre,td,th,h1,h2,h3'))
      .filter(isVisible)
      .map((element) => normalize(element.textContent))
      .filter((text) => text.length >= 20)
      .map((text) => text.slice(0, settings.maxBlockChars)),
    (text) => text.toLocaleLowerCase()
  );
  const text = blocks.join('\n');
  const normalizedTerms = unique(
    (options.focusTerms ?? []).map((term) => normalize(term).toLocaleLowerCase()).filter(Boolean),
    (term) => term
  );
  const snippets = options.mode === 'focused'
    ? focusedSnippets(blocks, normalizedTerms, settings.maxSnippets, settings.snippetChars)
    : [];
  const excerpt = options.mode === 'outline'
    ? truncate(blocks.slice(0, 1).join(' '), Math.min(settings.maxChars, 360))
    : options.mode === 'focused'
      ? truncate(snippets.join('\n'), settings.maxChars)
      : truncate(blocks.join('\n'), settings.maxChars);
  const pageKind = document.querySelector('article')
    ? 'article'
    : document.querySelector('input[type="search"],form[role="search"]')
      ? 'search'
      : document.querySelector('main,[role="main"]')
        ? 'document'
        : document.querySelector('form,input,textarea,select')
          ? 'application'
          : 'unknown';
  const returnedContent = [document.title, canonicalUrl, document.documentElement.lang, description, ...headings.map((heading) => heading.text), excerpt]
    .filter(Boolean)
    .join('\n');

  return {
    contentTrust: 'untrusted-page-data',
    title: normalize(document.title) || undefined,
    canonicalUrl,
    language: normalize(document.documentElement.lang) || undefined,
    description,
    headings,
    pageKind,
    excerpt: excerpt || undefined,
    snippets: snippets.length > 0 ? snippets : undefined,
    returnedChars: returnedContent.length,
    estimatedTokens: Math.ceil(returnedContent.length / 4),
    textLength: text.length,
    contentHash: `fnv1a64:${fnv1a(text.slice(0, 50000))}`,
    truncated: text.length > excerpt.length
  };

  function focusedSnippets(values: string[], terms: string[], maxSnippets: number, maxChars: number) {
    const candidates = terms.length === 0 ? values.slice(0, maxSnippets) : values.filter((value) => {
      const normalized = value.toLocaleLowerCase();
      return terms.some((term) => normalized.includes(term));
    });
    const selected = candidates.length > 0 ? candidates : values.slice(0, 1);
    return selected.slice(0, maxSnippets).map((value) => snippet(value, terms, maxChars));
  }

  function snippet(value: string, terms: string[], maxChars: number) {
    const normalized = value.toLocaleLowerCase();
    const index = terms.map((term) => normalized.indexOf(term)).filter((position) => position >= 0).sort((left, right) => left - right)[0] ?? 0;
    const start = Math.max(0, index - Math.floor(maxChars / 3));
    return truncate(value.slice(start), maxChars);
  }

  function truncate(value: string, maxChars: number) {
    return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }

  function fnv1a(value: string) {
    let hash = 0xcbf29ce484222325n;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= BigInt(value.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  }

  function pageExtractionBudget(input: PageExtractionOptions) {
    const defaults = input.budget === 'expanded'
      ? { maxChars: 6000, maxHeadings: 16, maxSnippets: 8, snippetChars: 900, maxBlockChars: 1800 }
      : input.budget === 'focused'
        ? { maxChars: 2000, maxHeadings: 10, maxSnippets: 5, snippetChars: 560, maxBlockChars: 1000 }
        : { maxChars: 800, maxHeadings: 6, maxSnippets: 3, snippetChars: 360, maxBlockChars: 600 };
    return {
      ...defaults,
      maxChars: Math.max(200, Math.min(input.maxChars ?? defaults.maxChars, 6000)),
      maxSnippets: Math.max(1, Math.min(input.maxSnippets ?? defaults.maxSnippets, 8))
    };
  }
}

function normalizePageExtractionOptions(options: ContentReadOptions): PageExtractionOptions {
  return {
    mode: options.mode ?? 'outline',
    budget: options.budget ?? 'compact',
    maxChars: options.maxChars,
    maxSnippets: options.maxSnippets,
    focusTerms: options.focusTerms
  };
}

function unsupportedPage(tabId: NativeTabId, url: string | undefined, discarded: boolean): Exclude<ContentInspectionOutcome, { status: 'ok' }> | undefined {
  if (discarded) {
    return { status: 'tab-unavailable', tabId, message: 'The tab is discarded and has no readable document.' };
  }
  if (!url) {
    return { status: 'tab-unavailable', tabId, message: 'The tab has no loaded URL.' };
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { status: 'unsupported-page', tabId, message: `The ${parsed.protocol} page cannot be inspected.` };
    }
    if (parsed.pathname.toLocaleLowerCase().endsWith('.pdf')) {
      return { status: 'unsupported-page', tabId, message: 'PDF viewer pages cannot be inspected through page scripting.' };
    }
  } catch {
    return { status: 'unsupported-page', tabId, message: 'The tab URL cannot be inspected.' };
  }

  return undefined;
}

function originPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/*`;
}

function callChrome<T>(invoke: (done: (result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(result);
    });
  });
}
