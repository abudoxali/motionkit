// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup, render} from '@testing-library/react';
import {Thumbnail} from '@remotion/player';
import type {ComponentType} from 'react';
import {useCurrentFrame} from 'remotion';
import {afterEach, describe, expect, it} from 'vitest';
import {sceneAt, sequenceScenes, soleOwnerWindow, timelineDuration, transitionProgress, validateSceneLayout} from '../motion/core';
import type {Scene} from '../motion/core';
import {SCENE_TRANSITIONS, SceneTimeline, hasOpaqueLayer, sceneLayersAt, transitionStyle, useScene} from '../motion/scenes';
import {defineProject, defineScenes, projectTimeline, validateProject} from '../projects/contract';
import type {ProjectDefinition} from '../projects/contract';
import {projectRegistry} from '../projects/registry';
import {focusDoodleProject} from '../projects/focus-doodle/timeline';

afterEach(cleanup);

const timeline = sequenceScenes([
  {id: 'hook', durationInFrames: 60},
  {id: 'demo', durationInFrames: 90, transitionInFrames: 12},
  {id: 'cut', durationInFrames: 30},
  {id: 'end', durationInFrames: 45, transitionInFrames: 8},
]);
const total = timelineDuration(timeline);
const ids = (frame: number) => sceneLayersAt(timeline, frame).map((layer) => layer.id);

describe('scene layout rules', () => {
  it('lays out sequential scenes and declared overlaps', () => {
    expect(timeline.map(({id, from, transitionInFrames}) => [id, from, transitionInFrames])).toEqual([
      ['hook', 0, 0],
      ['demo', 48, 12],
      ['cut', 138, 0],
      ['end', 160, 8],
    ]);
    expect(total).toBe(205);
    expect(validateSceneLayout(timeline, total)).toEqual([]);
  });

  it('rejects empty timelines, bad durations, gaps, undeclared and oversized overlaps', () => {
    const scene = (id: string, from: number, durationInFrames: number, transitionInFrames?: number): Scene => ({id, from, durationInFrames, transitionInFrames});
    const messages = (scenes: Scene[], duration?: number) => validateSceneLayout(scenes, duration).map((issue) => issue.message).join(' | ');
    expect(messages([])).toMatch(/at least one scene/);
    expect(messages([scene('a', 0, 0)])).toMatch(/positive integer duration/);
    expect(messages([scene('a', 0, 12.5)])).toMatch(/positive integer duration/);
    expect(messages([scene('a', 5, 10)])).toMatch(/first scene must start at frame 0/);
    expect(messages([scene('a', 0, 10, 2)])).toMatch(/no previous scene/);
    expect(messages([scene('a', 0, 10), scene('b', 12, 10)])).toMatch(/2-frame gap/);
    expect(messages([scene('a', 0, 10), scene('b', 6, 10)])).toMatch(/overlaps the previous scene by 4 frames but declares transitionInFrames 0/);
    expect(messages([scene('a', 0, 10), scene('b', 0, 10, 10)])).toMatch(/overlaps beyond/);
    expect(messages([scene('a', 0, 10), scene('b', 8, 4, 2), scene('c', 9, 10, 3)])).toMatch(/overlaps beyond/);
    expect(messages([scene('a', 0, 10), scene('b', 10, 10, -1)])).toMatch(/invalid transitionInFrames/);
    expect(messages([scene('a', 0, 10), scene('a', 10, 10)])).toMatch(/Duplicate scene id/);
    expect(messages([scene('a', 0, 10)], 12)).toMatch(/ends at frame 10, but the timeline lasts 12/);
    expect(() => sequenceScenes([])).toThrow(RangeError);
    expect(() => sequenceScenes([{id: 'a', durationInFrames: 10}, {id: 'b', durationInFrames: 5, transitionInFrames: 5}])).toThrow(/overlaps beyond/);
  });

  it('keeps review frames where a scene is alone on screen', () => {
    expect(soleOwnerWindow(timeline, 1)).toEqual({from: 60, to: 138});
    const withReview = (reviewFrame: number) => validateSceneLayout([{...timeline[0]}, {...timeline[1], reviewFrame}, ...timeline.slice(2)], total);
    expect(withReview(100)).toEqual([]);
    expect(withReview(50).map((issue) => issue.field)).toEqual(['reviewFrame']);
    expect(withReview(138).map((issue) => issue.field)).toEqual(['reviewFrame']);
  });
});

describe('scene layering', () => {
  it('shows one scene outside transitions and both, incoming on top, inside them', () => {
    expect(ids(0)).toEqual(['hook']);
    expect(ids(47)).toEqual(['hook']);
    expect(ids(48)).toEqual(['hook', 'demo']);
    expect(ids(59)).toEqual(['hook', 'demo']);
    expect(ids(60)).toEqual(['demo']);
    expect(ids(138)).toEqual(['cut']);
    expect(ids(total - 1)).toEqual(['end']);
    expect(ids(-1)).toEqual([]);
    expect(ids(total)).toEqual([]);
    const [outgoing, incoming] = sceneLayersAt(timeline, 50);
    expect(outgoing.role).toBe('resident');
    expect(incoming.role).toBe('incoming');
    expect(incoming.zIndex).toBeGreaterThan(outgoing.zIndex);
    expect(incoming.localFrame).toBe(2);
    expect(sceneAt(timeline, 50)?.id).toBe('demo');
  });

  it('starts transitions at 0 on the first overlap frame and completes on the first sole frame', () => {
    expect(transitionProgress(timeline[1], 48)).toBe(0);
    expect(transitionProgress(timeline[1], 54)).toBe(0.5);
    expect(transitionProgress(timeline[1], 60)).toBe(1);
    expect(transitionProgress(timeline[2], 138)).toBe(1);
    expect(sceneLayersAt(timeline, 48)[1].style).toEqual({opacity: 0});
    expect(sceneLayersAt(timeline, 60)[0].style).toEqual({});
  });

  it('never leaves a frame transparent or empty inside the timeline, for every transition', () => {
    for (const kind of SCENE_TRANSITIONS) {
      for (let frame = 0; frame < total; frame += 1) {
        const layers = sceneLayersAt(timeline, frame, () => kind, 'rtl');
        expect(layers.length, `${kind}@${frame}`).toBeGreaterThan(0);
        expect(hasOpaqueLayer(layers), `${kind}@${frame}`).toBe(true);
      }
    }
  });

  it('is deterministic when frames are evaluated out of order', () => {
    const frames = Array.from({length: total}, (_, frame) => frame);
    const forward = frames.map((frame) => sceneLayersAt(timeline, frame, () => 'slide', 'rtl'));
    const shuffled = [...frames].sort((a, b) => ((a * 7919) % 211) - ((b * 7919) % 211));
    const byFrame = new Map(shuffled.map((frame) => [frame, sceneLayersAt(timeline, frame, () => 'slide', 'rtl')]));
    expect(frames.map((frame) => byFrame.get(frame))).toEqual(forward);
  });

  it('moves slide and wipe in reading direction', () => {
    expect(transitionStyle('slide', 0, 'rtl').translate).toBe('160px 0');
    expect(transitionStyle('slide', 0, 'ltr').translate).toBe('-160px 0');
    expect(transitionStyle('wipe', 0.5, 'rtl').clipPath).toBe('inset(-20% 0 -20% 50%)');
    expect(transitionStyle('wipe', 0.5, 'ltr').clipPath).toBe('inset(-20% 50% -20% 0)');
    expect(transitionStyle('cut', 0, 'ltr')).toEqual({});
    expect(transitionStyle('fade', 1, 'ltr')).toEqual({});
  });
});

describe('project contract alignment', () => {
  const base: ProjectDefinition = {
    id: 'scene-contract',
    title: 'Scene contract',
    summary: 'Test project.',
    kind: 'fixture',
    language: 'en',
    direction: 'ltr',
    fps: 30,
    durationInFrames: 205,
    compositions: [{id: 'Scene-Contract', format: 'square'}],
    styleId: 'custom',
    scenes: [],
    fonts: ['display'],
    assets: [],
    defaultProps: {},
    editableProps: [],
    status: {stage: 'draft'},
  };

  it('builds contract scenes with computed frames and valid review frames', () => {
    const scenes = defineScenes([
      {id: 'hook', title: 'Hook', durationInFrames: 60},
      {id: 'demo', title: 'Demo', durationInFrames: 90, transitionInFrames: 12},
      {id: 'cut', title: 'Cut', durationInFrames: 30},
      {id: 'end', title: 'End', durationInFrames: 45, transitionInFrames: 8},
    ]);
    expect(scenes.map((scene) => [scene.id, scene.from, scene.transitionInFrames, scene.reviewFrame])).toEqual([
      ['hook', 0, undefined, 24],
      ['demo', 48, 12, 99],
      ['cut', 138, undefined, 149],
      ['end', 160, 8, 186],
    ]);
    const project = {...base, scenes};
    expect(validateProject(project)).toEqual([]);
    expect(projectTimeline(project)).toEqual(timeline);
  });

  it('accepts declared overlaps and rejects undeclared ones, gaps, and duration mismatches', () => {
    const scenes = defineScenes([
      {id: 'a', title: 'A', durationInFrames: 100},
      {id: 'b', title: 'B', durationInFrames: 115, transitionInFrames: 10},
    ]);
    expect(validateProject({...base, scenes})).toEqual([]);
    const paths = (changes: Partial<ProjectDefinition>) => validateProject({...base, scenes, ...changes}).map((issue) => issue.path);
    expect(paths({scenes: [scenes[0], {...scenes[1], transitionInFrames: undefined}]})).toContain('scenes[1].from');
    expect(paths({scenes: [scenes[0], {...scenes[1], from: 101, transitionInFrames: undefined}]})).toContain('scenes[1].from');
    expect(paths({durationInFrames: 300})).toContain('scenes[1]');
    expect(paths({scenes: [scenes[0], {...scenes[1], reviewFrame: 95}]})).toContain('scenes[1].reviewFrame');
    expect(() => defineProject({...base, id: 'bad-scenes', scenes: [scenes[1]]})).toThrow(/first scene must start at frame 0/);
  });

  it('keeps every registered project valid and Focus Doodle unchanged', () => {
    for (const {meta} of projectRegistry) {
      expect(validateSceneLayout(meta.scenes, meta.durationInFrames), meta.id).toEqual([]);
      expect(timelineDuration(projectTimeline(meta))).toBe(meta.durationInFrames);
    }
    const doodle = projectRegistry.find((entry) => entry.meta.id === 'focus-doodle')!.meta;
    expect(doodle.scenes.map((scene) => [scene.from, scene.durationInFrames, scene.transitionInFrames ?? 0])).toEqual(
      focusDoodleProject.beats.map((beat) => [beat.from, beat.durationInFrames, 0]),
    );
  });
});

describe('<SceneTimeline>', () => {
  const Probe = () => {
    const {scene, localFrame, transition, isFirstFrame, isLastFrame} = useScene();
    return <span data-probe={scene.id}>{JSON.stringify({frame: useCurrentFrame(), localFrame, transition, isFirstFrame, isLastFrame})}</span>;
  };
  const Timeline: ComponentType = () => (
    <SceneTimeline scenes={timeline} transition="fade" direction="rtl">
      {{hook: <Probe />, demo: <Probe />, cut: <Probe />, end: <Probe />}}
    </SceneTimeline>
  );
  const at = (frame: number, component: ComponentType = Timeline) =>
    render(
      <Thumbnail
        component={component}
        compositionWidth={320}
        compositionHeight={180}
        durationInFrames={total}
        fps={30}
        frameToDisplay={frame}
        errorFallback={({error}) => <output data-error>{error.message}</output>}
      />,
    );
  const errorOf = (component: ComponentType) => at(0, component).container.querySelector('[data-error]')?.textContent;
  const probes = (container: HTMLElement) =>
    Object.fromEntries(Array.from(container.querySelectorAll<HTMLElement>('[data-probe]'), (node) => [node.dataset.probe!, JSON.parse(node.textContent!)]));
  const visibleScenes = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-scene]')).filter((node) => node.style.visibility !== 'hidden').map((node) => node.dataset.scene);

  it('mounts only on-screen scenes and gives each its local frame', () => {
    const first = at(0).container;
    expect(visibleScenes(first)).toEqual(['hook']);
    expect(probes(first).hook).toEqual({frame: 0, localFrame: 0, transition: 1, isFirstFrame: true, isLastFrame: false});
    cleanup();
    const overlap = at(54).container;
    expect(visibleScenes(overlap)).toEqual(['hook', 'demo']);
    expect(probes(overlap).demo).toMatchObject({frame: 6, localFrame: 6, transition: 0.5});
    expect((overlap.querySelector('[data-scene="demo"]') as HTMLElement).style.opacity).toBe('0.5');
    cleanup();
    const last = at(total - 1).container;
    expect(visibleScenes(last)).toEqual(['end']);
    expect(probes(last).end).toMatchObject({localFrame: 44, isLastFrame: true});
  });

  it('fails loudly on missing scene content, invalid timelines, and useScene outside a scene', () => {
    const silence = () => {
      const original = console.error;
      console.error = () => {};
      return () => {
        console.error = original;
      };
    };
    const restore = silence();
    try {
      expect(errorOf(() => <SceneTimeline scenes={timeline}>{{hook: <Probe />}}</SceneTimeline>)).toMatch(/no content for scene "demo"/);
      cleanup();
      expect(errorOf(() => <SceneTimeline scenes={[{id: 'a', from: 3, durationInFrames: 10}]}>{() => null}</SceneTimeline>)).toMatch(/Invalid scene timeline/);
      cleanup();
      expect(errorOf(() => <Probe />)).toMatch(/inside a <SceneTimeline>/);
      cleanup();
      expect(errorOf(() => <SceneTimeline scenes={timeline} durationInFrames={total + 10}>{() => null}</SceneTimeline>)).toMatch(/timeline lasts/);
      cleanup();
      const protoScenes = [{id: 'toString', from: 0, durationInFrames: total}];
      expect(errorOf(() => <SceneTimeline scenes={protoScenes}>{{}}</SceneTimeline>)).toMatch(/no content for scene "toString"/);
    } finally {
      restore();
    }
  });
});
