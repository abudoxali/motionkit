import type {CSSProperties} from 'react';
import {sceneEnd, transitionProgress} from '../core/timeline';
import type {Scene} from '../core/timeline';
import {fade, slideIn, wipe} from '../core/transitions';
import type {TextDirection} from '../types';

// Pure scene layering: which scenes are on screen at a frame, in what order, and how the incoming
// scene's transition styles it. <SceneTimeline> renders exactly this, so tests can check any
// frame — including frames evaluated out of order — without rendering.
//
// Transitions are "cover" transitions: the outgoing scene stays fully opaque underneath while the
// incoming scene enters on top. That guarantees no frame is ever transparent or empty inside the
// timeline.

export type SceneTransition = 'cut' | 'fade' | 'slide' | 'wipe';

export const SCENE_TRANSITIONS: readonly SceneTransition[] = ['cut', 'fade', 'slide', 'wipe'];

export type SceneLayer = {
  id: string;
  index: number;
  /** Frame inside the scene (0 on its first frame). */
  localFrame: number;
  /** 0 → 1 through the incoming transition; 1 when the scene is fully in. */
  transition: number;
  role: 'incoming' | 'resident';
  zIndex: number;
  style: CSSProperties;
};

/** Style for an incoming scene `t` of the way through its transition (1 = fully in = no style). */
export const transitionStyle = (kind: SceneTransition, t: number, direction: TextDirection): CSSProperties => {
  if (t >= 1 || kind === 'cut') return {};
  if (kind === 'fade') return fade(t);
  if (kind === 'slide') return slideIn(direction, 160)(t);
  return wipe(direction)(t);
};

/** Layers on screen at `frame`, bottom first. Empty outside the timeline. */
export const sceneLayersAt = (
  scenes: readonly Scene[],
  frame: number,
  transitionFor: (scene: Scene) => SceneTransition = () => 'fade',
  direction: TextDirection = 'ltr',
): SceneLayer[] =>
  scenes.flatMap((scene, index) => {
    if (frame < scene.from || frame >= sceneEnd(scene)) return [];
    const t = transitionProgress(scene, frame);
    const incoming = t < 1;
    return [{
      id: scene.id,
      index,
      localFrame: frame - scene.from,
      transition: t,
      role: incoming ? 'incoming' : 'resident',
      zIndex: index + 1,
      style: incoming ? transitionStyle(transitionFor(scene), t, direction) : {},
    } satisfies SceneLayer];
  });

/** True when some layer at the frame is fully opaque and unclipped (no transparent frame). */
export const hasOpaqueLayer = (layers: readonly SceneLayer[]) => layers.some((layer) => Object.keys(layer.style).length === 0);
