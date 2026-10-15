import {describe, expect, it} from 'vitest';
import {
  bump,
  cameraTrack,
  cameraTransform,
  canvasMetrics,
  crossfade,
  decay,
  ease,
  identityCamera,
  inline,
  orientationOf,
  parallax,
  progress,
  safePoint,
  sceneAt,
  sceneProgress,
  sequenceScenes,
  slideIn,
  springAt,
  springs,
  stagger,
  timelineDuration,
  track,
  wipe,
  worldToScreen,
} from '../motion/core';
import * as choreography from '../projects/focus-doodle/choreography';

const frames = Array.from({length: 241}, (_, index) => index - 20);

describe('easing and springs', () => {
  it('maps every named curve from 0 to 1', () => {
    for (const [name, curve] of Object.entries(ease)) {
      expect(curve(0), name).toBeCloseTo(0, 5);
      // Remotion's exponential curve ends at 1 - 2^-10, so allow a thousandth.
      expect(curve(1), name).toBeCloseTo(1, 2);
    }
  });

  it('settles every spring preset near 1 and stays finite', () => {
    for (const name of Object.keys(springs) as (keyof typeof springs)[]) {
      const values = frames.map((frame) => springAt(frame, 30, name, 10));
      expect(values.every(Number.isFinite), name).toBe(true);
      expect(springAt(10, 30, name, 10)).toBe(0);
      expect(springAt(400, 30, name)).toBeCloseTo(1, 2);
    }
  });
});

describe('frame-pure timeline helpers', () => {
  it('returns identical values for repeated and out-of-order evaluation', () => {
    const sample = (frame: number) => [
      progress(frame, 10, 40),
      bump(frame, 20, 60),
      decay(frame, 30, 40, 0.8),
      track(frame, [[0, 0], [30, 100, ease.snap], [90, -40, ease.overshoot]]),
    ];
    const forward = frames.map(sample);
    const backward = [...frames].reverse().map(sample).reverse();
    expect(backward).toEqual(forward);
    expect(forward.flat().every(Number.isFinite)).toBe(true);
  });

  it('clamps progress and track outside their windows', () => {
    expect(progress(-100, 10, 40)).toBe(0);
    expect(progress(400, 10, 40)).toBe(1);
    expect(track(-5, [[0, 3], [10, 9]])).toBe(3);
    expect(track(50, [[0, 3], [10, 9]])).toBe(9);
    expect(stagger(3, 5, 12)).toBe(27);
  });

  it('keeps Focus Doodle helpers identical to the shared core', () => {
    for (const frame of frames) {
      expect(choreography.progress(frame, 5, 70)).toBe(progress(frame, 5, 70));
      expect(choreography.track(frame, [[0, 0], [60, 1, choreography.overshoot]])).toBe(track(frame, [[0, 0], [60, 1, ease.overshoot]]));
    }
  });
});

describe('scene timing', () => {
  const scenes = sequenceScenes([
    {id: 'hook', durationInFrames: 60},
    {id: 'demo', durationInFrames: 90, overlapInFrames: 10},
    {id: 'end', durationInFrames: 45},
  ]);

  it('lays scenes out back to back with explicit overlaps', () => {
    expect(scenes).toEqual([
      {id: 'hook', from: 0, durationInFrames: 60, transitionInFrames: 0},
      {id: 'demo', from: 50, durationInFrames: 90, transitionInFrames: 10},
      {id: 'end', from: 140, durationInFrames: 45, transitionInFrames: 0},
    ]);
    expect(timelineDuration(scenes)).toBe(185);
  });

  it('resolves the owning scene, preferring the later scene in an overlap', () => {
    expect(sceneAt(scenes, 0)?.id).toBe('hook');
    expect(sceneAt(scenes, 55)?.id).toBe('demo');
    expect(sceneAt(scenes, 184)?.id).toBe('end');
    expect(sceneAt(scenes, 185)).toBeNull();
    expect(sceneAt(scenes, -1)).toBeNull();
    expect(sceneProgress(scenes[2], 184)).toBe(1);
  });

  it('rejects invalid timelines instead of producing gaps', () => {
    expect(() => sequenceScenes([])).toThrow(RangeError);
    expect(() => sequenceScenes([{id: 'a', durationInFrames: 0}])).toThrow(RangeError);
    expect(() => sequenceScenes([{id: 'a', durationInFrames: 10.5}])).toThrow(RangeError);
    expect(() => sequenceScenes([{id: 'a', durationInFrames: 10}, {id: 'a', durationInFrames: 10}])).toThrow(/Duplicate/);
    expect(() => sequenceScenes([{id: 'a', durationInFrames: 10}, {id: 'b', durationInFrames: 10, overlapInFrames: 10}])).toThrow(/overlaps/);
    expect(() => sequenceScenes([{id: 'a', durationInFrames: 10}, {id: 'b', durationInFrames: 10, overlapInFrames: -2}])).toThrow(RangeError);
  });
});

describe('camera', () => {
  it('leaves the canvas untouched with the identity camera', () => {
    const camera = identityCamera(1080, 1920);
    expect(worldToScreen({x: 100, y: 300}, camera, 1080, 1920)).toEqual({x: 100, y: 300});
    expect(cameraTransform(camera, 1080, 1920)).toBe('translate(540px, 960px) rotate(0deg) scale(1) translate(-540px, -960px)');
  });

  it('centres the camera target and applies zoom', () => {
    const camera = {x: 300, y: 400, zoom: 2, rotate: 0};
    expect(worldToScreen({x: 300, y: 400}, camera, 1080, 1920)).toEqual({x: 540, y: 960});
    expect(worldToScreen({x: 310, y: 400}, camera, 1080, 1920)).toEqual({x: 560, y: 960});
  });

  it('evaluates keyframed cameras deterministically and damps parallax layers', () => {
    const keys = {x: [[0, 540], [60, 300]] as const, y: [[0, 960], [60, 500]] as const, zoom: [[0, 1], [30, 1.6]] as const};
    const values = frames.map((frame) => cameraTrack(frame, keys));
    expect(values.every((camera) => Object.values(camera).every(Number.isFinite))).toBe(true);
    const camera = cameraTrack(60, keys);
    expect(parallax(camera, 0, 1080, 1920)).toEqual(identityCamera(1080, 1920));
    expect(parallax(camera, 1, 1080, 1920)).toEqual(camera);
  });
});

describe('responsive coordinates and transitions', () => {
  it('classifies orientation and keeps the safe rect inside the canvas', () => {
    expect(orientationOf(1920, 1080)).toBe('landscape');
    expect(orientationOf(1080, 1920)).toBe('portrait');
    expect(orientationOf(1080, 1080)).toBe('square');
    for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      const metrics = canvasMetrics(width, height);
      expect(metrics.safeRect.x).toBeGreaterThan(0);
      expect(metrics.safeRect.x + metrics.safeRect.width).toBeLessThan(width);
      expect(metrics.safeRect.y + metrics.safeRect.height).toBeLessThan(height);
      expect(safePoint(metrics, 0.5, 0.5).x).toBeCloseTo(metrics.safeRect.x + metrics.safeRect.width / 2);
    }
    expect(() => canvasMetrics(0, 1080)).toThrow(RangeError);
  });

  it('moves along the reading direction', () => {
    expect(inline(40, 'ltr')).toBe(40);
    expect(inline(40, 'rtl')).toBe(-40);
    expect(slideIn('rtl')(0).translate).toBe('120px 0');
    expect(slideIn('ltr')(0).translate).toBe('-120px 0');
    expect(slideIn('rtl')(1).translate).toBe('0px 0');
    expect(wipe('rtl')(0.25).clipPath).toBe('inset(-20% 0 -20% 75%)');
    expect(wipe('ltr')(1).clipPath).toBe('inset(-20% 0% -20% 0)');
  });

  it('never leaves both scenes transparent during a cross-fade', () => {
    for (let frame = 0; frame <= 30; frame += 1) {
      const {outgoing, incoming} = crossfade(frame, 10, 20);
      expect(outgoing + incoming).toBeCloseTo(1);
    }
  });
});
