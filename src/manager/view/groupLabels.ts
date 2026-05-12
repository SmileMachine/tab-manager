import type { GroupSpan, NativeGroupId } from '../../domain/types';
import type { WindowRow } from '../../domain/windowRows';

export interface GroupLabelPlacement {
  collapsed: boolean;
  group: GroupSpan | Extract<WindowRow, { kind: 'group-summary' }>;
  rowSpan: number;
  rowStart: number;
}

export function createGroupLabels(
  rows: WindowRow[],
  spansByStart: Map<number, GroupSpan>,
  collapsedGroupIds: ReadonlySet<NativeGroupId>
): GroupLabelPlacement[] {
  const labels: GroupLabelPlacement[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (row.kind === 'group-summary') {
      labels.push({
        collapsed: true,
        group: row,
        rowStart: rowIndex + 1,
        rowSpan: 1
      });
      continue;
    }

    if (!row.isGroupStart) {
      continue;
    }

    const group = spansByStart.get(row.listIndex);

    if (!group) {
      continue;
    }

    labels.push({
      collapsed: collapsedGroupIds.has(group.groupId),
      group,
      rowStart: rowIndex + 1,
      rowSpan: countVisibleGroupRows(rows, rowIndex, group.groupId)
    });
  }

  return labels;
}

function countVisibleGroupRows(rows: WindowRow[], startIndex: number, groupId: NativeGroupId) {
  let count = 0;

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.kind !== 'tab' || row.groupId !== groupId) {
      break;
    }

    count += 1;
  }

  return count;
}
