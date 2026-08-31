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

  it('keeps an ungrouped tab and its dragged fallback limited to the content column', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root">
        <div class="sortable-root-item sortable-root-tab-item sortable-tab-item">
          <div class="tab-grid-row"><div class="tab-row"></div></div>
        </div>
      </div>
      <div class="sortable-fallback sortable-root-item sortable-root-tab-item sortable-tab-item">
        <div class="tab-grid-row"><div class="tab-row"></div></div>
      </div>
    `;

    const tab = document.querySelector<HTMLElement>('.sortable-window-root > .sortable-root-tab-item');
    const fallback = document.querySelector<HTMLElement>('.sortable-fallback');

    if (!tab || !fallback) {
      throw new Error('test fixture is invalid');
    }

    expect(getComputedStyle(document.documentElement).getPropertyValue('--group-rail-width').trim()).toBe('168px');
    expect(getComputedStyle(tab).marginLeft).toBe('var(--group-rail-width)');
    expect(getComputedStyle(fallback).display).toBe('block');
    expect(getComputedStyle(fallback).gridTemplateColumns).toBe('');
  });

  it('keeps a grouped tab entering the root list in the content column', () => {
    document.body.innerHTML = `
      <div class="sortable-window-root">
        <div class="sortable-tab-item">
          <div class="tab-grid-row"><div class="tab-row"></div></div>
        </div>
      </div>
    `;

    const tab = document.querySelector<HTMLElement>('.sortable-window-root > .sortable-tab-item');

    if (!tab) {
      throw new Error('test fixture is invalid');
    }

    expect(getComputedStyle(document.documentElement).getPropertyValue('--group-rail-width').trim()).toBe('168px');
    expect(getComputedStyle(tab).marginLeft).toBe('var(--group-rail-width)');
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

  it('keeps collapsed group labels aligned with compact tab row height', () => {
    document.body.className = 'density-compact';
    document.body.innerHTML = `
      <section class="sortable-group-block is-collapsed">
        <div class="group-rail-item">
          <div class="group-label">
            <input class="selection-checkbox" />
            <div class="group-label-text"><strong>Curiosity</strong></div>
            <button class="icon-button"></button>
          </div>
        </div>
        <div class="group-tabs-column">
          <div class="group-summary-panel">
            <div class="group-summary-content">
              <div class="tab-grid-row group-summary-grid-row">
                <div class="group-summary-row"><span>14 tabs</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    const label = document.querySelector<HTMLElement>('.group-label');
    const row = document.querySelector<HTMLElement>('.tab-grid-row');

    if (!label || !row) {
      throw new Error('test fixture is invalid');
    }

    expect(getComputedStyle(document.body).getPropertyValue('--row-height').trim()).toBe('36px');
    expect(getComputedStyle(row).minHeight).toBe('var(--row-height)');
    expect(getComputedStyle(label).paddingTop).toBe('5px');
    expect(getComputedStyle(label).paddingBottom).toBe('5px');
  });
});
