import type {TextDirection} from '../types';
import type {FontRole} from './fonts';

// Typography tokens scale from the canvas, so a 9:16 reel and a 16:9 explainer get comparable
// optical sizes without per-composition magic numbers.

export type TypeLevel = 'display' | 'heading' | 'body' | 'caption';

type LevelToken = {
  role: FontRole;
  weight: number;
  /** Size as a fraction of the shorter canvas side. */
  scale: number;
  /** Smallest readable size in composition pixels (24px floor on a 1080 canvas). */
  floor: number;
};

export const typeLevels: Record<TypeLevel, LevelToken> = {
  display: {role: 'display', weight: 800, scale: 0.11, floor: 56},
  heading: {role: 'display', weight: 700, scale: 0.068, floor: 40},
  body: {role: 'text', weight: 400, scale: 0.036, floor: 26},
  caption: {role: 'text', weight: 600, scale: 0.042, floor: 28},
};

/**
 * Arabic marks and dots extend well beyond the em box, so Arabic needs more leading than Latin.
 * Mixed lines use the Arabic value because the tallest glyph sets the clipping risk.
 */
export const lineHeightFor = (direction: TextDirection, level: TypeLevel = 'body') => {
  const tight = level === 'display' || level === 'heading';
  if (direction === 'rtl') return tight ? 1.35 : 1.6;
  return tight ? 1.12 : 1.45;
};

export const typeSize = (level: TypeLevel, width: number, height: number) => {
  const token = typeLevels[level];
  return Math.max(token.floor, Math.round(Math.min(width, height) * token.scale));
};

// Safe areas are a layout concern owned by the motion core; re-exported for typography callers.
export {safeAreaFor} from '../core/layout';
export type {SafeArea} from '../core/layout';
