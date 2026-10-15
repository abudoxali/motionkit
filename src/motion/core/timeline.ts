import {interpolate} from 'remotion';
import {ease} from './easing';
import type {Ease} from './easing';

// Pure functions of the frame number. Nothing here reads the clock, keeps state between frames,
// or uses randomness, so Studio scrubbing, stills, and the owner's export all agree.

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0 → 1 between two frames with easing, clamped outside the window. */
export const progress = (frame: number, from: number, to: number, easing: Ease = ease.smooth) =>
  interpolate(frame, [from, to], [0, 1], {...clamp, easing});

/** 0 → 1 → 0 over the window; used for squash, impacts, and one-off accents. */
export const bump = (frame: number, from: number, to: number) =>
  frame <= from || frame >= to ? 0 : Math.sin(((frame - from) / (to - from)) * Math.PI);

/** Decaying oscillation starting at `at`; used for impact shakes and follow-through. */
export const decay = (frame: number, at: number, length: number, frequency: number) =>
  frame < at || frame > at + length ? 0 : Math.sin((frame - at) * frequency) * (1 - (frame - at) / length);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export type Key = readonly [frame: number, value: number, easing?: Ease];

/** Keyframe track with per-segment easing (the easing belongs to the segment ending at that key). */
export const track = (frame: number, keys: readonly Key[]) => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let index = 1; index < keys.length; index += 1) {
    const [to, value, segmentEase = ease.smooth] = keys[index];
    if (frame <= to) {
      const [from, start] = keys[index - 1];
      return mix(start, value, segmentEase(to === from ? 1 : (frame - from) / (to - from)));
    }
  }
  return keys[keys.length - 1][1];
};

/** Start frame of the i-th item in a staggered group. */
export const stagger = (index: number, step: number, start = 0) => start + index * step;

export const framesFromSeconds = (seconds: number, fps: number) => Math.round(seconds * fps);

/* ------------------------------------------------------------------ scenes */

// One set of scene-layout rules shared by sequenceScenes(), the project contract, and the
// <SceneTimeline> component, so metadata, validation, and rendering always agree:
//  - Scenes are ordered and the first starts at frame 0.
//  - Each scene starts exactly where the previous one ends, minus its declared transitionInFrames.
//    An overlap that is not declared is an error, and so is a gap (gaps render empty frames).
//  - A transition is shorter than both scenes it joins and never reaches into the previous
//    scene's own transition window.
//  - During an overlap the incoming (later) scene owns the frame and draws on top.
//  - The last scene ends exactly at the timeline duration.
//  - A review frame lies where its scene is the only one on screen.

export type SceneSpec<Id extends string = string> = {
  id: Id;
  durationInFrames: number;
  /** Frames this scene overlaps the previous one; the transition plays in this window. */
  transitionInFrames?: number;
  /** @deprecated Use transitionInFrames. */
  overlapInFrames?: number;
};

export type Scene<Id extends string = string> = {
  id: Id;
  from: number;
  durationInFrames: number;
  /** Overlap with the previous scene (0 for a cut and for the first scene). */
  transitionInFrames?: number;
};

export type SceneLayoutInput = Scene & {reviewFrame?: number};

export type SceneLayoutIssue = {index: number; field?: 'id' | 'from' | 'durationInFrames' | 'transitionInFrames' | 'reviewFrame'; message: string};

const isNonNegativeInteger = (value: number) => Number.isInteger(value) && value >= 0;

export const sceneEnd = (scene: Scene) => scene.from + scene.durationInFrames;

/** Frames where `scene` is the only scene on screen: after its own transition, before the next one. */
export const soleOwnerWindow = (scenes: readonly Scene[], index: number) => {
  const scene = scenes[index];
  const next = scenes[index + 1];
  return {from: scene.from + (scene.transitionInFrames ?? 0), to: sceneEnd(scene) - (next?.transitionInFrames ?? 0)};
};

export const validateSceneLayout = (scenes: readonly SceneLayoutInput[], durationInFrames?: number): SceneLayoutIssue[] => {
  const issues: SceneLayoutIssue[] = [];
  if (scenes.length === 0) return [{index: -1, message: 'A timeline needs at least one scene.'}];
  const ids = new Set<string>();
  scenes.forEach((scene, index) => {
    const transition = scene.transitionInFrames ?? 0;
    if (ids.has(scene.id)) issues.push({index, field: 'id', message: `Duplicate scene id: ${scene.id}`});
    ids.add(scene.id);
    if (!Number.isInteger(scene.durationInFrames) || scene.durationInFrames <= 0) {
      issues.push({index, field: 'durationInFrames', message: `Scene ${scene.id} needs a positive integer duration.`});
      return;
    }
    if (!isNonNegativeInteger(scene.from)) {
      issues.push({index, field: 'from', message: `Scene ${scene.id} must start at a non-negative integer frame.`});
      return;
    }
    if (!isNonNegativeInteger(transition)) {
      issues.push({index, field: 'transitionInFrames', message: `Scene ${scene.id} has an invalid transitionInFrames.`});
      return;
    }
    if (index === 0) {
      if (scene.from !== 0) issues.push({index, field: 'from', message: `The first scene must start at frame 0, not ${scene.from}.`});
      if (transition !== 0) issues.push({index, field: 'transitionInFrames', message: 'The first scene has no previous scene to transition from.'});
    } else {
      const previous = scenes[index - 1];
      const expected = sceneEnd(previous) - transition;
      if (scene.from < expected) {
        issues.push({index, field: 'from', message: `Scene ${scene.id} overlaps the previous scene by ${expected - scene.from + transition} frames but declares transitionInFrames ${transition}.`});
      } else if (scene.from > expected) {
        issues.push({index, field: 'from', message: `Scene ${scene.id} leaves a ${scene.from - expected}-frame gap after ${previous.id}; gaps render empty frames.`});
      }
      if (transition > 0 && (transition >= scene.durationInFrames || transition >= previous.durationInFrames - (previous.transitionInFrames ?? 0))) {
        issues.push({index, field: 'transitionInFrames', message: `Scene ${scene.id} overlaps beyond the previous scene: a ${transition}-frame transition must be shorter than both scenes and stay out of the previous transition.`});
      }
    }
    if (scene.reviewFrame !== undefined && issues.every((issue) => issue.index !== index)) {
      const window = soleOwnerWindow(scenes, index);
      if (!Number.isInteger(scene.reviewFrame) || scene.reviewFrame < window.from || scene.reviewFrame >= window.to) {
        issues.push({index, field: 'reviewFrame', message: `Review frame ${scene.reviewFrame} must fall where ${scene.id} is alone on screen (frames ${window.from}–${window.to - 1}).`});
      }
    }
  });
  const last = scenes[scenes.length - 1];
  if (durationInFrames !== undefined && Number.isInteger(last.durationInFrames) && sceneEnd(last) !== durationInFrames) {
    issues.push({index: scenes.length - 1, message: `The last scene ends at frame ${sceneEnd(last)}, but the timeline lasts ${durationInFrames} frames.`});
  }
  return issues;
};

/**
 * Lays scenes out back to back, with explicit transition overlaps, and validates the result with
 * the shared rules. A typo in a duration throws instead of producing a gap or a hidden scene.
 */
export const sequenceScenes = <Id extends string>(specs: readonly SceneSpec<Id>[]): Scene<Id>[] => {
  let cursor = 0;
  const scenes = specs.map((spec, index) => {
    const transitionInFrames = spec.transitionInFrames ?? spec.overlapInFrames ?? 0;
    const from = cursor - (Number.isFinite(transitionInFrames) ? transitionInFrames : 0);
    cursor = from + spec.durationInFrames;
    return {id: spec.id, from, durationInFrames: spec.durationInFrames, transitionInFrames};
  });
  const issues = validateSceneLayout(scenes);
  if (issues.length > 0) throw new RangeError(issues.map((issue) => issue.message).join(' '));
  return scenes;
};

export const timelineDuration = (scenes: readonly Scene[]) => Math.max(...scenes.map(sceneEnd));

/** The scene that owns `frame`: the later scene during a transition overlap, or null outside. */
export const sceneAt = <Id extends string>(scenes: readonly Scene<Id>[], frame: number): Scene<Id> | null => {
  for (let index = scenes.length - 1; index >= 0; index -= 1) {
    const scene = scenes[index];
    if (frame >= scene.from && frame < sceneEnd(scene)) return scene;
  }
  return null;
};

/** Local 0 → 1 progress through a scene, clamped. */
export const sceneProgress = (scene: Scene, frame: number, easing: Ease = ease.linear) =>
  progress(frame, scene.from, sceneEnd(scene) - 1, easing);

/** 0 → 1 across the scene's incoming transition window; 1 for cuts and outside the window. */
export const transitionProgress = (scene: Scene, frame: number) => {
  const transition = scene.transitionInFrames ?? 0;
  if (transition <= 0) return 1;
  return Math.min(1, Math.max(0, (frame - scene.from) / transition));
};
