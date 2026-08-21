export type NativeGroupId = number;
export type NativeTabId = number;
export type NativeWindowId = number;

export type BrowserWindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
export type BrowserWindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked' | 'locked-fullscreen';

export type BrowserTabStatus = 'loading' | 'complete' | 'unloaded';

export type BrowserTabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface BrowserWindowBounds {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
}

export interface BrowserWindowRecord {
  id: NativeWindowId;
  focused: boolean;
  type: BrowserWindowType;
  state?: BrowserWindowState;
  incognito?: boolean;
  alwaysOnTop?: boolean;
  bounds?: BrowserWindowBounds;
  sessionId?: string;
  tabCount?: number;
  groupCount?: number;
}

export interface BrowserTabRecord {
  id: NativeTabId;
  windowId: NativeWindowId;
  index: number;
  groupId: NativeGroupId;
  title: string;
  url?: string;
  pendingUrl?: string;
  pinned: boolean;
  active: boolean;
  highlighted?: boolean;
  audible: boolean;
  muted?: boolean;
  mutedReason?: string;
  discarded?: boolean;
  autoDiscardable?: boolean;
  frozen?: boolean;
  status?: BrowserTabStatus;
  incognito?: boolean;
  openerTabId?: NativeTabId;
  sessionId?: string;
  lastAccessed?: number;
  favIconUrl?: string;
  hostname?: string | null;
  origin?: string | null;
  protocol?: string | null;
  pathname?: string | null;
  isNewTab?: boolean;
  isInternalPage?: boolean;
  isPdf?: boolean;
  previousTabId?: NativeTabId;
  nextTabId?: NativeTabId;
  previousGroupId?: NativeGroupId;
  nextGroupId?: NativeGroupId;
}

export interface BrowserTabGroupRecord {
  id: NativeGroupId;
  windowId: NativeWindowId;
  title?: string;
  color: BrowserTabGroupColor;
  collapsed: boolean;
  tabIds?: NativeTabId[];
  tabCount?: number;
  startIndex?: number;
  endIndex?: number;
  hostnameCounts?: Record<string, number>;
  representativeTitles?: string[];
}

export interface BrowserSnapshot {
  windows: BrowserWindowRecord[];
  tabs: BrowserTabRecord[];
  groups: BrowserTabGroupRecord[];
}

export interface BrowserSnapshotView {
  windows: WindowView[];
}

export interface WindowView {
  id: NativeWindowId;
  focused: boolean;
  type: BrowserWindowType;
  items: TabListItem[];
  groupSpans: GroupSpan[];
}

export interface TabListItem {
  kind: 'tab';
  tab: BrowserTabRecord;
  group?: BrowserTabGroupRecord;
}

export interface GroupSpan {
  groupId: NativeGroupId;
  windowId: NativeWindowId;
  title?: string;
  color: BrowserTabGroupColor;
  startIndex: number;
  endIndex: number;
  tabIds: NativeTabId[];
  tabCount: number;
}
