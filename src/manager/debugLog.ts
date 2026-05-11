export function debugDrag(label: string, data?: unknown) {
  console.debug(`[tab-group:drag] ${label}`, {
    data,
    now: Math.round(performance.now())
  });
}
