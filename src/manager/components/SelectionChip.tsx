import { X } from 'lucide-react';

interface SelectionChipProps {
  count: number;
  onClear: () => void;
}

export function SelectionChip({ count, onClear }: SelectionChipProps) {
  if (count <= 0) return null;

  return (
    <span className="selection-chip">
      <span>{count} selected</span>
      <button aria-label="Clear selection" type="button" onClick={onClear}>
        <X aria-hidden="true" size={13} />
      </button>
    </span>
  );
}
