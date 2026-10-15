import type {CSSProperties} from 'react';
import {interpolate} from 'remotion';

// Transition foundations: pure progress → style functions. Components apply them to scene
// wrappers; the timeline decides when `t` runs from 0 to 1.

const unit = (t: number) => Math.max(0, Math.min(1, t));

export type TransitionStyle = (t: number) => CSSProperties;

/** Opacity in from 0 → 1. Pair with `1 - t` for the outgoing scene. */
export const fade: TransitionStyle = (t) => ({opacity: unit(t)});

/** Enter by sliding along the reading direction: from the right in RTL, from the left in LTR. */
export const slideIn = (direction: 'rtl' | 'ltr', distance = 120): TransitionStyle => (t) => ({
  opacity: interpolate(unit(t), [0, 0.6], [0, 1], {extrapolateRight: 'clamp'}),
  translate: `${(1 - unit(t)) * distance * (direction === 'rtl' ? 1 : -1)}px 0`,
});

/** Reveal with a clip that wipes in reading direction; negative block insets protect Arabic marks. */
export const wipe = (direction: 'rtl' | 'ltr'): TransitionStyle => (t) => {
  const hidden = (1 - unit(t)) * 100;
  return {clipPath: direction === 'rtl' ? `inset(-20% 0 -20% ${hidden}%)` : `inset(-20% ${hidden}% -20% 0)`};
};

/** Scale up from a point with a fade; for pop-ins and reveals. */
export const zoomIn = (from = 0.85): TransitionStyle => (t) => ({opacity: unit(t), scale: from + (1 - from) * unit(t)});

/**
 * Opacity pair for a cross-fade inside an overlap window [start, end]: the outgoing scene fades
 * out while the incoming one fades in, with no frame where both are transparent.
 */
export const crossfade = (frame: number, start: number, end: number) => {
  const t = interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return {outgoing: 1 - t, incoming: t};
};
