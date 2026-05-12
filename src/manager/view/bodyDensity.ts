export type BodyDensity = 'comfortable' | 'compact';

const densityClasses = ['density-comfortable', 'density-compact'];

export function applyBodyDensityClass(body: HTMLElement, density: BodyDensity) {
  body.classList.remove(...densityClasses);
  body.classList.add(`density-${density}`);
}

export function clearBodyDensityClass(body: HTMLElement) {
  body.classList.remove(...densityClasses);
}
