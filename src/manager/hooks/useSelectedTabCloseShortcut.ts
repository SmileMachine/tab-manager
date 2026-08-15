import { useEffect } from 'react';

export interface UseSelectedTabCloseShortcutOptions {
  enabled: boolean;
  onCloseSelectedTabs: () => void;
}

export function useSelectedTabCloseShortcut({ enabled, onCloseSelectedTabs }: UseSelectedTabCloseShortcutOptions) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== 'Backspace' && event.key !== 'Delete') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      onCloseSelectedTabs();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onCloseSelectedTabs]);
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : undefined;

  return Boolean(element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}
