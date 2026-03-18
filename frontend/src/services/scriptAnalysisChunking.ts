const CHUNK_TARGET_CHARS = 1200;
const CHUNK_MAX_CHARS = 1600;
const CHUNK_ENTITY_LIMIT = 30;
const SCENE_BOUNDARY_RE = /^\s*(第[零〇一二三四五六七八九十百千两\d０-９]+\s*[集回话章节卷部篇]|(?:episode|ep\.?|chapter|part|vol\.?)\s*\d+|s\s*\d+\s*e\s*\d+|\d{1,4}\s*[-—–]\s*\d{1,4}\b)/i;

export interface ScriptChunk {
  index: number;
  total: number;
  content: string;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function splitLongBlock(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > CHUNK_MAX_CHARS) {
    const candidate = remaining.slice(0, CHUNK_MAX_CHARS);
    const breakpoints = [
      candidate.lastIndexOf('\n\n'),
      candidate.lastIndexOf('\n'),
      candidate.lastIndexOf('。'),
      candidate.lastIndexOf('！'),
      candidate.lastIndexOf('？'),
    ].filter(index => index >= Math.floor(CHUNK_TARGET_CHARS * 0.6));
    const splitIndex = breakpoints.length > 0 ? Math.max(...breakpoints) + 1 : CHUNK_MAX_CHARS;
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function buildBlocks(script: string): string[] {
  const lines = normalizeNewlines(script).split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isBoundary = SCENE_BOUNDARY_RE.test(line.trim());
    if (isBoundary && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current.join('\n').trim());
  }

  return blocks.flatMap(block => block.length > CHUNK_MAX_CHARS ? splitLongBlock(block) : [block]);
}

export function splitScriptIntoChunks(script: string): ScriptChunk[] {
  const blocks = buildBlocks(script).filter(Boolean);
  if (blocks.length === 0) {
    return [{ index: 1, total: 1, content: script.trim() }];
  }

  const merged: string[] = [];
  let current = '';

  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length <= CHUNK_MAX_CHARS) {
      current = next;
      continue;
    }

    if (current) {
      merged.push(current.trim());
    }
    current = block;
  }

  if (current) {
    merged.push(current.trim());
  }

  return merged.map((content, index, array) => ({
    index: index + 1,
    total: array.length,
    content,
  }));
}

export function buildChunkContextPrompt(
  prompt: string,
  label: string,
  chunk: ScriptChunk,
  existingNames: string[]
): string {
  const uniqueNames = Array.from(new Set(existingNames)).slice(0, CHUNK_ENTITY_LIMIT);
  const contextSection = [
    '【分块解析上下文】',
    `当前处理第 ${chunk.index}/${chunk.total} 段剧本。`,
    uniqueNames.length > 0
      ? `已识别${label}：${uniqueNames.join('、')}。请不要重复返回这些名称。`
      : `此前尚未识别到${label}。`,
    `如果本段没有新的${label}，请返回空数组。`,
  ].join('\n');

  return `${prompt}\n\n${contextSection}`;
}
