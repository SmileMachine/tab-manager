import { useCallback, useEffect, useRef, useState } from 'react';

import type { BrowserTabGroupColor, GroupSpan } from '../../domain/types';
import type { WindowRow } from '../../domain/windowRows';
import { useEscapeHandler } from '../hooks/useEscapeStack';

export interface GroupEditMenuState {
  autoFocusName?: boolean;
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  x: number;
  y: number;
}

export function GroupEditPopover({
  colorOptions,
  menu,
  onClose,
  onUpdate
}: {
  colorOptions: BrowserTabGroupColor[];
  menu: GroupEditMenuState;
  onClose: () => void;
  onUpdate: (changes: { title?: string; color?: BrowserTabGroupColor }) => void;
}) {
  const [title, setTitle] = useState(menu.group.title ?? '');
  const [color, setColor] = useState<BrowserTabGroupColor>(menu.group.color);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const popoverPosition = { left: menu.x + 8, top: menu.y + 8 };

  useEffect(() => {
    const pointerListener = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', pointerListener);

    return () => {
      document.removeEventListener('pointerdown', pointerListener);
    };
  }, [onClose]);
  useEscapeHandler(
    useCallback(() => {
      onClose();
      return true;
    }, [onClose])
  );

  useEffect(() => {
    if (!menu.autoFocusName) {
      return;
    }

    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [menu.autoFocusName]);

  return (
    <div className="group-edit-popover" ref={popoverRef} style={popoverPosition}>
      <label>
        Name
        <input
          ref={nameInputRef}
          value={title}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onClose();
            }
          }}
          onChange={(event) => {
            const nextTitle = event.target.value;
            setTitle(nextTitle);
            onUpdate({ title: nextTitle });
          }}
        />
      </label>
      <div className="color-picker" role="group" aria-label="Color">
        <span className="color-picker-label">Color</span>
        <div className="color-swatches">
          {colorOptions.map((option) => (
            <button
              aria-label={`Set color ${option}`}
              aria-pressed={color === option}
              className={`color-swatch group-color-${option}`}
              key={option}
              type="button"
              onClick={() => {
                setColor(option);
                onUpdate({ color: option });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
