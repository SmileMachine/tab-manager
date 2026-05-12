export type EscapeHandler = () => boolean;

export interface EscapeStack {
  dispatch: () => boolean;
  push: (handler: EscapeHandler) => () => void;
}

export function createEscapeStack(): EscapeStack {
  const handlers: EscapeHandler[] = [];

  return {
    dispatch() {
      return handlers.at(-1)?.() ?? false;
    },
    push(handler) {
      handlers.push(handler);

      return () => {
        const index = handlers.lastIndexOf(handler);

        if (index !== -1) {
          handlers.splice(index, 1);
        }
      };
    }
  };
}
