declare module 'sortablejs/modular/sortable.complete.esm.js' {
  export interface SortableEvent {
    from: HTMLElement;
    item: HTMLElement;
    to: HTMLElement;
  }

  export interface SortableOptions {
    animation?: number;
    chosenClass?: string;
    dragClass?: string;
    draggable?: string;
    fallbackOnBody?: boolean;
    filter?: string;
    forceFallback?: boolean;
    ghostClass?: string;
    group?:
      | string
      | {
          name: string;
          pull?: boolean;
          put?: boolean | ((to: Sortable, from: Sortable, dragged: HTMLElement) => boolean);
        };
    handle?: string;
    multiDrag?: boolean;
    onEnd?: (event: SortableEvent) => void;
    onMove?: (event: { dragged: HTMLElement }) => boolean;
    selectedClass?: string;
  }

  export default class Sortable {
    static utils: {
      deselect(element: HTMLElement): void;
      select(element: HTMLElement): void;
    };

    constructor(element: HTMLElement, options?: SortableOptions);
    destroy(): void;
  }
}
