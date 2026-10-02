import { describe, expect, it, vi } from 'vitest';
import { createRestrictedFetch, normalizeResponsesEventBlock, summarizeAgentToolOutput } from './runtime';

describe('Responses stream compatibility', () => {
  it('summarizes bounded tool results without retaining tab payloads', () => {
    expect(summarizeAgentToolOutput('read_tabs', {
      type: 'tool-result',
      output: { total: 240, returned: 200 }
    })).toEqual({ summary: '返回 200/240 个标签页', detail: '未显示其余 40 个标签页，请使用搜索缩小范围。' });
    expect(summarizeAgentToolOutput('propose_plan', {
      type: 'tool-result',
      output: { accepted: true, operationCount: 3 }
    })).toEqual({ summary: '已生成 3 个操作', detail: '方案尚未直接修改浏览器。' });
  });

  it('fills omitted function-call arguments on output_item.added events', () => {
    const block = [
      'event: response.output_item.added',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"call_id":"call-1","name":"search_tabs","type":"function_call","id":"fc-1","status":"in_progress"}}'
    ].join('\n');

    const normalized = JSON.parse(normalizeResponsesEventBlock(block).split('data: ')[1]);
    expect(normalized.item.arguments).toBe('');
    expect(normalized.item.name).toBe('search_tabs');
  });

  it('preserves supported events and already complete function-call items', () => {
    const complete = 'data: {"type":"response.output_item.done","item":{"type":"function_call","arguments":"{\\"query\\":\\"影音与娱乐\\"}"}}';
    const text = 'data: {"type":"response.output_text.delta","delta":"好的"}';

    expect(normalizeResponsesEventBlock(complete)).toBe(complete);
    expect(normalizeResponsesEventBlock(text)).toBe(text);
  });

  it('normalizes events while preserving streaming response boundaries', async () => {
    const source = [
      'data: {"type":"response.output_item.added","output_index":1,"item":{"call_id":"call-1","name":"search_tabs","type":"function_call","id":"fc-1","status":"in_progress"}}',
      '',
      'data: {"type":"response.output_item.done","output_index":1,"item":{"type":"function_call","call_id":"call-1","name":"search_tabs","arguments":"{\\"query\\":\\"影音与娱乐\\"}","id":"fc-1","status":"completed"}}',
      '',
      'data: {"type":"response.completed","response":{}}',
      ''
    ].join('\n');
    const fetchImpl = vi.fn(async () => new Response(source, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }));

    const response = await createRestrictedFetch('https://provider.example/v1', fetchImpl)('https://provider.example/v1/responses');
    const body = await response.text();

    expect(body).toContain('"arguments":""');
    expect(body).toContain('"arguments":"{\\"query\\":\\"影音与娱乐\\"}"');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
