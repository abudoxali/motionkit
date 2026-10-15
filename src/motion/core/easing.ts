import {Easing, spring} from 'remotion';

// One vocabulary of curves and springs for every component, so "snap" or "gentle" means the
// same motion across presets, fixtures, and productions.

export type Ease = (t: number) => number;

export const ease = {
  /** Default for most moves: symmetric acceleration and deceleration. */
  smooth: Easing.inOut(Easing.cubic) as Ease,
  /** Entrances: fast start, soft landing. */
  snap: Easing.out(Easing.cubic) as Ease,
  /** Entrances that land past the target and settle back. */
  overshoot: Easing.out(Easing.back(1.7)) as Ease,
  /** Upward arcs and lifts. */
  rise: Easing.out(Easing.quad) as Ease,
  /** Exits and gravity. */
  fall: Easing.in(Easing.quad) as Ease,
  /** Crash zooms and impacts. */
  crash: Easing.out(Easing.exp) as Ease,
  /** Calm camera travel. */
  drift: Easing.inOut(Easing.sin) as Ease,
  linear: ((t: number) => t) as Ease,
} as const;

export type EaseName = keyof typeof ease;

export const springs = {
  /** Calm, no bounce: titles and camera settles. */
  gentle: {damping: 200, stiffness: 100, mass: 1},
  /** Quick and precise: UI and kinetic words. */
  snappy: {damping: 18, stiffness: 180, mass: 0.7},
  /** Playful bounce: icons and doodles. */
  bouncy: {damping: 10, stiffness: 160, mass: 0.8},
  /** Heavy objects and slams. */
  heavy: {damping: 22, stiffness: 90, mass: 1.6},
} as const;

export type SpringName = keyof typeof springs;

/** Frame-driven spring with a named preset; `delay` shifts the start without accumulating state. */
export const springAt = (frame: number, fps: number, name: SpringName = 'snappy', delay = 0) =>
  spring({frame: frame - delay, fps, config: springs[name]});
