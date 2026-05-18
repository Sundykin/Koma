export const LINGHUI_WORKFLOW_BLOCK_LABEL = '工作流块';
export const LINGHUI_NEW_WORKFLOW_BLOCK_LABEL = '新工作流块';
export const LINGHUI_LIBTV_GROUP_LABEL = '分组';
export const LINGHUI_LIBTV_STORYBOARD_GROUP_LABEL = '分镜组';

const WORKFLOW_BLOCK_LABEL_REGEX = /^工作流块(?:\s+(\d+))?$/u;
const LIBTV_GROUP_COUNT_LABEL_REGEX = /^分组\s*\d+\s*个节点$/u;
const LIBTV_STORYBOARD_GROUP_COUNT_LABEL_REGEX = /^分镜组\s*\d+\s*个节点$/u;

export function resolveLinghuiWorkflowBlockLabel(label?: string | null): string {
  const normalized = label?.trim();
  return normalized || LINGHUI_WORKFLOW_BLOCK_LABEL;
}

export function createNextLinghuiWorkflowBlockLabel(
  existingLabels: Array<string | null | undefined>,
): string {
  let maxIndex = 0;

  for (const label of existingLabels) {
    const normalized = label?.trim();
    if (!normalized) {
      continue;
    }

    if (normalized === LINGHUI_NEW_WORKFLOW_BLOCK_LABEL) {
      maxIndex = Math.max(maxIndex, 1);
      continue;
    }

    const match = normalized.match(WORKFLOW_BLOCK_LABEL_REGEX);
    if (!match) {
      continue;
    }

    const currentIndex = match[1] ? Number(match[1]) : 1;
    if (Number.isFinite(currentIndex)) {
      maxIndex = Math.max(maxIndex, currentIndex);
    }
  }

  return `${LINGHUI_WORKFLOW_BLOCK_LABEL} ${Math.max(maxIndex + 1, 1)}`;
}

export function isAutoLinghuiGroupCountLabel(label?: string | null): boolean {
  const normalized = label?.trim();
  return !normalized
    || normalized === LINGHUI_WORKFLOW_BLOCK_LABEL
    || normalized === LINGHUI_NEW_WORKFLOW_BLOCK_LABEL
    || WORKFLOW_BLOCK_LABEL_REGEX.test(normalized)
    || LIBTV_GROUP_COUNT_LABEL_REGEX.test(normalized)
    || LIBTV_STORYBOARD_GROUP_COUNT_LABEL_REGEX.test(normalized);
}

export function buildLinghuiGroupCountLabel(childCount: number, storyboardGroup = false): string {
  const safeCount = Math.max(0, Math.round(childCount));
  const prefix = storyboardGroup ? LINGHUI_LIBTV_STORYBOARD_GROUP_LABEL : LINGHUI_LIBTV_GROUP_LABEL;
  return `${prefix} ${safeCount} 个节点`;
}
