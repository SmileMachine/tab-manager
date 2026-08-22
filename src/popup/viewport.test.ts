import { calculatePopupHeight } from './viewport';

describe('calculatePopupHeight', () => {
  it('uses the available viewport height', () => {
    expect(calculatePopupHeight(545)).toBe(545);
    expect(calculatePopupHeight(560)).toBe(560);
  });

  it('floors fractional viewport heights to avoid overflow', () => {
    expect(calculatePopupHeight(545.45)).toBe(545);
  });

  it('uses the default height when the viewport measurement is invalid', () => {
    expect(calculatePopupHeight(Number.NaN)).toBe(560);
    expect(calculatePopupHeight(0)).toBe(560);
  });
});
