export interface DuplicateFilterToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function DuplicateFilterToggle({ enabled, onChange }: DuplicateFilterToggleProps) {
  return (
    <button
      aria-pressed={enabled}
      className="toolbar-toggle"
      type="button"
      onClick={() => onChange(!enabled)}
    >
      Duplicates
    </button>
  );
}
