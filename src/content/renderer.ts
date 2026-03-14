import type { SubtitleCue } from '../shared/types';

const LOG_PREFIX = '[YT Dual Sub][renderer]';
let lookupCount = 0;
let lastResultKey = '';

export function findActiveCue(
  cues: SubtitleCue[],
  currentTimeMs: number,
): SubtitleCue | null {
  lookupCount += 1;

  if (!cues.length) {
    if (lookupCount % 240 === 0) {
      console.log(`${LOG_PREFIX} no cues available`, { currentTimeMs });
    }
    return null;
  }

  let left = 0;
  let right = cues.length - 1;
  let found: SubtitleCue | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const cue = cues[mid];

    if (currentTimeMs < cue.startMs) {
      right = mid - 1;
    } else if (currentTimeMs > cue.endMs) {
      left = mid + 1;
    } else {
      found = cue;
      break;
    }
  }

  const resultKey = found
    ? `${found.startMs}:${found.endMs}:${found.text}`
    : `none:${Math.floor(currentTimeMs / 250)}`;

  if (resultKey !== lastResultKey) {
    lastResultKey = resultKey;
    console.log(`${LOG_PREFIX} findActiveCue result`, {
      currentTimeMs,
      cuesLength: cues.length,
      found: found
        ? {
            startMs: found.startMs,
            endMs: found.endMs,
            textPreview: found.text.slice(0, 80),
          }
        : null,
    });
  }

  return found;
}