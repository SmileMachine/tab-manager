import { contextMenuPosition } from './contextMenuPosition';

describe('contextMenuPosition', () => {
  it('treats the menu point as viewport coordinates for a fixed menu', () => {
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 120 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 80 });

    expect(contextMenuPosition({ x: 300, y: 200 }, { width: 220, height: 100 })).toEqual({
      left: 306,
      top: 206
    });
  });
});
