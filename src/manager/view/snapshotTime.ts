export function defaultSnapshotName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function uniqueSnapshotName(baseName: string, existingNames: Iterable<string>): string {
  const names = new Set(existingNames);
  if (!names.has(baseName)) return baseName;

  let suffix = 2;
  while (names.has(`${baseName} (${suffix})`)) suffix += 1;
  return `${baseName} (${suffix})`;
}
