import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { applyBodyDensityClass, clearBodyDensityClass } from './bodyDensity';

const styles = readFileSync(join(process.cwd(), 'src/manager/styles.css'), 'utf8');

describe('drag styles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
  });

  it('keeps the active density row height available to dragged fallback groups', () => {
    applyBodyDensityClass(document.body, 'comfortable');
    document.body.innerHTML = `
      <section class="sortable-fallback sortable-group-block">
        <div class="group-rail-item"></div>
        <div class="group-tabs-column">
          <div class="group-tabs-panel">
            <div class="group-tabs-content">
              <div class="sortable-group-tabs">
                <div class="sortable-tab-item">
                  <div class="tab-grid-row"><div class="tab-row"></div></div>
                </div>
                <div class="sortable-tab-item">
                  <div class="tab-grid-row"><div class="tab-row"></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    const panel = document.querySelector<HTMLElement>('.group-tabs-panel');
    const content = document.querySelector<HTMLElement>('.group-tabs-content');
    const row = document.querySelector<HTMLElement>('.tab-grid-row');
    const rail = document.querySelector<HTMLElement>('.group-rail-item');

    if (!panel || !content || !row || !rail) {
      throw new Error('test fixture is invalid');
    }

    expect(getComputedStyle(document.body).getPropertyValue('--row-height').trim()).toBe('48px');
    expect(getComputedStyle(row).minHeight).toBe('var(--row-height)');
    expect(getComputedStyle(rail).minHeight).toBe('var(--row-height)');
  });

  it('removes stale body density before applying the next density', () => {
    applyBodyDensityClass(document.body, 'comfortable');
    applyBodyDensityClass(document.body, 'compact');

    expect(document.body.classList.contains('density-comfortable')).toBe(false);
    expect(document.body.classList.contains('density-compact')).toBe(true);
    expect(getComputedStyle(document.body).getPropertyValue('--row-height').trim()).toBe('36px');

    clearBodyDensityClass(document.body);

    expect(document.body.classList.contains('density-compact')).toBe(false);
  });
});
