import {describe, expect, it} from 'vitest';
import {bubbleAt, bubbleSpecs, cameraAt, characterAt} from '../projects/focus-doodle/choreography';
import {focusDoodleProject, getFocusBeatAtFrame} from '../projects/focus-doodle/timeline';

describe('focus doodle production timeline', () => {
  it('keeps the owner-requested vertical 30-second delivery contract', () => {
    expect(focusDoodleProject).toMatchObject({
      compositionId: 'Focus-Doodle-Vertical',
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
    });
  });

  it('routes every timeline boundary to one connected narrative beat', () => {
    expect(getFocusBeatAtFrame(0).id).toBe('overwhelmed');
    expect(getFocusBeatAtFrame(224).id).toBe('overwhelmed');
    expect(getFocusBeatAtFrame(225).id).toBe('accumulation');
    expect(getFocusBeatAtFrame(450).id).toBe('decision');
    expect(getFocusBeatAtFrame(675).id).toBe('resolution');
    expect(getFocusBeatAtFrame(899).id).toBe('resolution');
  });

  it('rejects frames outside the reviewable composition', () => {
    expect(() => getFocusBeatAtFrame(-1)).toThrow(/outside/i);
    expect(() => getFocusBeatAtFrame(900)).toThrow(/outside/i);
  });
});

describe('focus doodle choreography', () => {
  const frames = Array.from({length: focusDoodleProject.durationInFrames}, (_, frame) => frame);

  it('opens on a phone close-up and crash-zooms out within the first two seconds', () => {
    expect(cameraAt(0).zoom).toBeGreaterThan(2);
    expect(cameraAt(45).zoom).toBeLessThan(1.1);
  });

  it('produces finite, deterministic rig and camera values for every frame', () => {
    for (const frame of frames) {
      const character = characterAt(frame);
      const camera = cameraAt(frame);
      for (const value of [...Object.values(character.pose), character.x, camera.x, camera.y, camera.zoom, camera.rotate]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(characterAt(512)).toEqual(characterAt(512));
  });

  it('moves the legs independently while walking and lifts off the ground for the jump', () => {
    const walking = frames.filter((frame) => frame >= 600 && frame <= 630).map((frame) => characterAt(frame).pose);
    expect(walking.some((pose) => Math.abs(pose.lKnee - pose.rKnee) > 20)).toBe(true);
    expect(characterAt(826).pose.lift).toBeGreaterThan(80);
  });

  it('sweeps every distraction into the box before the resolution beat', () => {
    bubbleSpecs.forEach((_, index) => expect(bubbleAt(index, 600).opacity).toBe(0));
  });

  it('settles into a still final hold', () => {
    expect(cameraAt(880)).toEqual(cameraAt(899));
    expect(characterAt(880).pose).toEqual(characterAt(899).pose);
  });
});
