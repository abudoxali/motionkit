import {ease} from '../core/easing';
import {mix} from '../core/timeline';
import type {Ease, EaseName} from '../core/easing';

// Pure placement maths for supplied images: fitting a screenshot into a frame without distortion,
// zoom and pan toward a focal point, mapping image-space highlights to the screen, and keyframed
// transforms for character artwork. Every function is a function of its inputs and the frame.

export type Rect = {x: number; y: number; width: number; height: number};
export type Size = {width: number; height: number};
export type Point = readonly [x: number, y: number];
export type FitMode = 'contain' | 'cover';

/**
 * Where an image of `image` size is drawn inside `viewport`: uniform scale only (never distorted),
 * `contain` shows all of it, `cover` fills the viewport and crops around `focus` (0–1 in the image).
 */
export const fitRect = (viewport: Size, image: Size, fit: FitMode, focus: Point = [0.5, 0.5]): Rect => {
  const scale = fit === 'contain'
    ? Math.min(viewport.width / image.width, viewport.height / image.height)
    : Math.max(viewport.width / image.width, viewport.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  // Cover: put the focus at the viewport centre as far as the image edges allow.
  const x = fit === 'contain' ? (viewport.width - width) / 2 : clamp(viewport.width / 2 - focus[0] * width, viewport.width - width, 0);
  const y = fit === 'contain' ? (viewport.height - height) / 2 : clamp(viewport.height / 2 - focus[1] * height, viewport.height - height, 0);
  return {x, y, width, height};
};

export type ZoomKey = {frame: number; scale: number; focus?: Point; ease?: EaseName};
export type ZoomState = {scale: number; focus: Point};

/** Zoom level and focus at a frame from keyframes (each key's easing shapes the segment ending at it). */
export const zoomAt = (frame: number, keys: readonly ZoomKey[] | undefined): ZoomState => {
  if (!keys || keys.length === 0) return {scale: 1, focus: [0.5, 0.5]};
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  const focusOf = (key: ZoomKey): Point => key.focus ?? [0.5, 0.5];
  if (frame <= sorted[0].frame) return {scale: sorted[0].scale, focus: focusOf(sorted[0])};
  for (let index = 1; index < sorted.length; index += 1) {
    const key = sorted[index];
    if (frame <= key.frame) {
      const previous = sorted[index - 1];
      const t = (ease[key.ease ?? 'smooth'] as Ease)(key.frame === previous.frame ? 1 : (frame - previous.frame) / (key.frame - previous.frame));
      return {
        scale: mix(previous.scale, key.scale, t),
        focus: [mix(focusOf(previous)[0], focusOf(key)[0], t), mix(focusOf(previous)[1], focusOf(key)[1], t)],
      };
    }
  }
  const last = sorted[sorted.length - 1];
  return {scale: last.scale, focus: focusOf(last)};
};

/**
 * The image rectangle after zooming by `zoom.scale` toward `zoom.focus`, kept inside the viewport
 * where possible so a zoom never reveals empty space beyond a covering image.
 */
export const zoomedRect = (base: Rect, viewport: Size, zoom: ZoomState): Rect => {
  if (zoom.scale === 1) return base;
  const width = base.width * zoom.scale;
  const height = base.height * zoom.scale;
  // The focus point (in image space) moves toward the viewport centre as the zoom increases.
  const fx = base.x + zoom.focus[0] * base.width;
  const fy = base.y + zoom.focus[1] * base.height;
  const pull = Math.min(1, Math.max(0, (zoom.scale - 1) / Math.max(zoom.scale, 1e-6)));
  const targetX = mix(fx, viewport.width / 2, pull);
  const targetY = mix(fy, viewport.height / 2, pull);
  let x = targetX - zoom.focus[0] * width;
  let y = targetY - zoom.focus[1] * height;
  // Keep a zoomed image that fills the viewport from exposing its edges.
  if (width >= viewport.width) x = Math.min(0, Math.max(viewport.width - width, x));
  if (height >= viewport.height) y = Math.min(0, Math.max(viewport.height - height, y));
  return {x, y, width, height};
};

/** A rectangle given in image fractions (0–1), mapped onto the drawn image. */
export const imageToScreen = (image: Rect, region: readonly [x: number, y: number, width: number, height: number]): Rect => ({
  x: image.x + region[0] * image.width,
  y: image.y + region[1] * image.height,
  width: region[2] * image.width,
  height: region[3] * image.height,
});

// Device frames ----------------------------------------------------------------------------------

export type DeviceKind = 'none' | 'card' | 'phone' | 'browser';

/** Bezel / chrome insets around the screen area, as fractions of the device's shorter side. */
const DEVICE_INSETS: Record<DeviceKind, {side: number; top: number; bottom: number; radius: number}> = {
  none: {side: 0, top: 0, bottom: 0, radius: 0},
  card: {side: 0, top: 0, bottom: 0, radius: 0.035},
  phone: {side: 0.045, top: 0.045, bottom: 0.045, radius: 0.13},
  browser: {side: 0, top: 0.075, bottom: 0, radius: 0.02},
};

/**
 * The largest device of the right shape that fits `area`, and the screen inside it, so that a
 * screenshot of aspect `imageAspect` fills the screen exactly (no crop, no letterbox).
 */
export const deviceLayout = (area: Rect, imageAspect: number, kind: DeviceKind) => {
  const inset = DEVICE_INSETS[kind];
  // Bezels scale with k = the screen's shorter side = m·w for screen width w, so the device is
  // linear in w: width w(1 + 2s·m), height w(1/aspect + (t+b)·m). Solve for the largest w exactly.
  const m = imageAspect <= 1 ? 1 : 1 / imageAspect;
  const screenWidth = Math.min(area.width / (1 + 2 * inset.side * m), area.height / (1 / imageAspect + (inset.top + inset.bottom) * m));
  const screenHeight = screenWidth / imageAspect;
  const k = Math.min(screenWidth, screenHeight);
  const deviceWidth = screenWidth + 2 * inset.side * k;
  const deviceHeight = screenHeight + (inset.top + inset.bottom) * k;
  const device: Rect = {x: area.x + (area.width - deviceWidth) / 2, y: area.y + (area.height - deviceHeight) / 2, width: deviceWidth, height: deviceHeight};
  const screen: Rect = {x: device.x + inset.side * k, y: device.y + inset.top * k, width: screenWidth, height: screenHeight};
  return {device, screen, radius: inset.radius * k, screenRadius: Math.max(0, (inset.radius - inset.side) * k), chrome: inset.top * k};
};

// Keyframed transforms ----------------------------------------------------------------------------

export type TransformKey = {
  frame: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  opacity?: number;
  ease?: EaseName;
};

export type TransformState = {x: number; y: number; scale: number; rotate: number; opacity: number};

/** Each property interpolates between the keys that set it; unset properties hold their last value. */
export const transformAt = (frame: number, keys: readonly TransformKey[], initial: TransformState): TransformState => {
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  const value = (prop: keyof TransformState) => {
    const points = sorted.filter((key) => key[prop] !== undefined) as (TransformKey & Record<typeof prop, number>)[];
    if (points.length === 0) return initial[prop];
    if (frame <= points[0].frame) return points[0][prop];
    for (let index = 1; index < points.length; index += 1) {
      const key = points[index];
      if (frame <= key.frame) {
        const previous = points[index - 1];
        const t = (ease[key.ease ?? 'smooth'] as Ease)(key.frame === previous.frame ? 1 : (frame - previous.frame) / (key.frame - previous.frame));
        return mix(previous[prop], key[prop], t);
      }
    }
    return points[points.length - 1][prop];
  };
  return {x: value('x'), y: value('y'), scale: value('scale'), rotate: value('rotate'), opacity: value('opacity')};
};

export type Idle = {
  /** Vertical bob in pixels. */
  bob?: number;
  /** Breathing scale amplitude (e.g. 0.01 = ±1%). */
  breathe?: number;
  /** Sway in degrees around the anchor. */
  sway?: number;
  /** Frames per cycle. */
  period?: number;
  /** Phase offset in frames, so several characters do not move in unison. */
  phase?: number;
};

/** Subtle looping idle motion, a pure function of the frame. */
export const idleAt = (frame: number, {bob = 0, breathe = 0, sway = 0, period = 90, phase = 0}: Idle = {}) => {
  const t = ((frame + phase) / Math.max(1, period)) * Math.PI * 2;
  return {y: -Math.abs(Math.sin(t)) * bob, scale: 1 + Math.sin(t) * breathe, rotate: Math.sin(t + Math.PI / 3) * sway};
};

export type Entrance = {
  type: 'fade' | 'rise' | 'scale' | 'slide-start' | 'slide-end' | 'pop';
  /** Frame the entrance (or exit) starts. */
  frame: number;
  duration?: number;
};

/** Opacity and offset of an entrance or exit at a frame. `distance` is in pixels for slides and rises. */
export const entranceAt = (frame: number, entrance: Entrance | undefined, direction: 'in' | 'out', distance: number) => {
  if (!entrance) return {opacity: 1, x: 0, y: 0, scale: 1};
  const duration = entrance.duration ?? 18;
  const raw = Math.min(1, Math.max(0, (frame - entrance.frame) / Math.max(1, duration)));
  const p = direction === 'in' ? raw : 1 - raw;
  const curve = entrance.type === 'pop' && direction === 'in' ? ease.overshoot : direction === 'in' ? ease.snap : ease.fall;
  const t = direction === 'in' ? curve(p) : 1 - curve(1 - p);
  const away = 1 - t;
  switch (entrance.type) {
    case 'fade':
      return {opacity: t, x: 0, y: 0, scale: 1};
    case 'rise':
      return {opacity: Math.min(1, t * 1.6), x: 0, y: away * distance, scale: 1};
    case 'scale':
      return {opacity: Math.min(1, t * 1.6), x: 0, y: 0, scale: 0.86 + 0.14 * t};
    case 'pop':
      return {opacity: Math.min(1, Math.max(0, t) * 2), x: 0, y: 0, scale: Math.max(0.001, t)};
    case 'slide-start':
      return {opacity: Math.min(1, t * 2), x: -away * distance, y: 0, scale: 1};
    case 'slide-end':
      return {opacity: Math.min(1, t * 2), x: away * distance, y: 0, scale: 1};
  }
};

/** Index of the active pose for a frame: the last pose whose `from` is at or before it. */
export const poseAt = <Pose extends {from: number}>(frame: number, poses: readonly Pose[]): number => {
  let active = 0;
  poses.forEach((pose, index) => {
    if (pose.from <= frame && pose.from >= poses[active].from) active = index;
  });
  return active;
};
