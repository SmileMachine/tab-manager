import type { BulkCloseSummary } from '../../domain/commands';
import type { NativeTabId } from '../../domain/types';

export interface BulkCloseRequest {
  invalidated: boolean;
  summary: BulkCloseSummary;
  tabIds: NativeTabId[];
}

export function BulkCloseDialog({
  onCancel,
  onConfirm,
  request
}: {
  onCancel: () => void;
  onConfirm: () => void;
  request: BulkCloseRequest;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog" role="dialog">
        <h2>Close {request.summary.tabCount} tabs?</h2>
        <p>
          {request.summary.windowCount} windows · pinned tabs: {request.summary.containsPinnedTabs ? 'yes' : 'no'}
        </p>
        {request.invalidated ? (
          <p className="dialog-warning">Browser tab state changed. Review the refreshed confirmation before closing tabs.</p>
        ) : null}
        <ul>
          {request.summary.exampleTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            {request.invalidated ? 'Refresh confirmation' : `Close ${request.summary.tabCount} tabs`}
          </button>
        </div>
      </section>
    </div>
  );
}
