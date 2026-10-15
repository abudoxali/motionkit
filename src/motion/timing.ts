// Compatibility surface. New code should import from './core' (timing, scenes, camera) and
// './typography' (Arabic text helpers); these names stay exported for existing callers.
export {framesFromSeconds} from './core/timeline';
export {normalizeArabic} from './typography/script';

export const clampedProgress = (frame: number, start: number, end: number) => {
  if (end <= start) return frame >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (frame - start) / (end - start)));
};
