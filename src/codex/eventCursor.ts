export interface BrowserStateEvent {
  cursor: number;
  occurredAt: string;
  type: string;
  requiresSnapshot: true;
}

export class BrowserEventCursor {
  private nextCursor = 1;
  private readonly events: BrowserStateEvent[] = [];

  constructor(private readonly maxEvents = 256, private readonly now: () => Date = () => new Date()) {}

  append(type: string): BrowserStateEvent {
    const event: BrowserStateEvent = { cursor: this.nextCursor++, occurredAt: this.now().toISOString(), type, requiresSnapshot: true };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return event;
  }

  read(after = 0, limit = 50) {
    const events = this.events.filter((event) => event.cursor > after).slice(0, limit);
    const firstCursor = this.events[0]?.cursor ?? this.nextCursor;
    return {
      events,
      nextCursor: events.at(-1)?.cursor ?? after,
      hasMore: this.events.some((event) => event.cursor > (events.at(-1)?.cursor ?? after)),
      requiresSnapshot: after < firstCursor - 1
    };
  }
}
