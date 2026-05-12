import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';

import { useEscapeHandler } from '../hooks/useEscapeStack';

export function WindowTitle({
  defaultName,
  name,
  onSave
}: {
  defaultName: string;
  name: string | undefined;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name || defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayName = name || defaultName;

  useEffect(() => {
    if (!editing) {
      setDraft(displayName);
    }
  }, [displayName, editing]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const save = () => {
    onSave(draft.trim());
    setEditing(false);
  };
  const cancel = useCallback(() => {
    setDraft(displayName);
    setEditing(false);
    return true;
  }, [displayName]);

  useEscapeHandler(cancel, editing);

  if (editing) {
    return (
      <div className="window-title-edit">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
        />
        <button aria-label="Save window name" className="icon-button" type="button" onClick={save}>
          <Check aria-hidden="true" size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="window-title">
      <h2>{displayName}</h2>
      <button
        aria-label={`Rename ${displayName}`}
        className="icon-button window-title-edit-button"
        type="button"
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
