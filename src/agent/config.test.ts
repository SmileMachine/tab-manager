import { describe, expect, it } from 'vitest';
import { originPermissionForApiRoot, responsesUrl, validateApiRoot } from './config';

describe('Agent connection configuration', () => {
  it('normalizes an HTTPS API root and derives the Responses resource', () => {
    expect(validateApiRoot('https://api.example.test/v1/')).toBe('https://api.example.test/v1');
    expect(responsesUrl('https://api.example.test/v1/')).toBe('https://api.example.test/v1/responses');
    expect(originPermissionForApiRoot('https://api.example.test/v1')).toBe('https://api.example.test/*');
  });

  it.each(['http://api.example.test/v1', 'https://user:pass@api.example.test/v1', 'https://api.example.test/v1?x=1', 'https://api.example.test/v1/responses'])('rejects unsafe root %s', (value) => {
    expect(() => validateApiRoot(value)).toThrow();
  });
});
