import { useEffect } from 'react';

import { createEscapeStack, type EscapeHandler } from '../escapeStack';

const escapeStack = createEscapeStack();

export function useEscapeHandler(handler: EscapeHandler, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return escapeStack.push(handler);
  }, [enabled, handler]);
}

export function useEscapeDispatcher() {
  useEffect(() => {
    const keyListener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (escapeStack.dispatch()) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', keyListener);

    return () => {
      document.removeEventListener('keydown', keyListener);
    };
  }, []);
}
