import type { WindowRow } from '../../domain/windowRows';

export function GroupSummaryRow({ row }: { row: Extract<WindowRow, { kind: 'group-summary' }> }) {
  return (
    <div className="group-summary-row">
      <span>{row.tabCount} tabs</span>
      {row.domains.map((domain) => (
        <span className="domain-chip" key={domain}>
          {domain}
        </span>
      ))}
    </div>
  );
}
