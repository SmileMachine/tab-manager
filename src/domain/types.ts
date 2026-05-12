export type NativeGroupId = number;
export type NativeTabId = number;
export type NativeWindowId = number;

export type BrowserWindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools';

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

export interface BrowserWindowRecord {
  id: NativeWindowId;
  focused: boolean;
  type: BrowserWindowType;
}

export interface BrowserTabRecord {
  id: NativeTabId;
  windowId: NativeWindowId;
  index: number;
  groupId: NativeGroupId;
  title: string;
  url?: string;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  favIconUrl?: string;
}

export interface BrowserTabGroupRecord {
  id: NativeGroupId;
  windowId: NativeWindowId;
  title?: string;
  color: BrowserTabGroupColor;
  collapsed: boolean;
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

