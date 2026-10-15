import {createContext, useContext} from 'react';
import type {FC, ReactNode} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {sceneEnd, validateSceneLayout} from '../core/timeline';
import type {Scene} from '../core/timeline';
import type {TextDirection} from '../types';
import {sceneLayersAt} from './layers';
import type {SceneTransition} from './layers';

// A small scene layer over Remotion <Sequence>. Each scene mounts only while it is on screen,
// sees scene-local frames through useCurrentFrame(), and can read its timing with useScene().
// Layering and transition styles come from the pure sceneLayersAt(), evaluated per frame.

export type SceneInfo = {
  scene: Scene;
  index: number;
  /** Frame inside the scene; same as useCurrentFrame() inside the scene. */
  localFrame: number;
  /** 0 → 1 through the scene's whole duration. */
  progress: number;
  /** 0 → 1 through the incoming transition; 1 once fully in. */
  transition: number;
  isFirstFrame: boolean;
  isLastFrame: boolean;
};

const SceneContext = createContext<SceneInfo | null>(null);

/** Timing of the enclosing scene. Throws outside <SceneTimeline>, so misuse is caught early. */
export const useScene = (): SceneInfo => {
  const info = useContext(SceneContext);
  if (!info) throw new Error('useScene() must be called inside a <SceneTimeline> scene.');
  return info;
};

export type SceneTimelineProps = {
  scenes: readonly Scene[];
  /** Content per scene id, or a render function. Every scene must have content. */
  children: Readonly<Record<string, ReactNode>> | ((scene: Scene, index: number) => ReactNode);
  /** Transition into each scene that declares transitionInFrames. */
  transition?: SceneTransition | ((scene: Scene) => SceneTransition);
  /** Slide and wipe travel in reading direction. */
  direction?: TextDirection;
  /** Frames to mount a scene early so heavy content is ready (Remotion premountFor). */
  premountFor?: number;
  /**
   * Frames the timeline must fill exactly (usually the composition or project duration). When set,
   * a timeline that ends early or late is an error instead of silently leaving empty frames.
   */
  durationInFrames?: number;
};

const SceneLayerView: FC<{scenes: readonly Scene[]; index: number; timelineFrame: number; transitionFor: (scene: Scene) => SceneTransition; direction: TextDirection; children: ReactNode}> = ({
  scenes,
  index,
  timelineFrame,
  transitionFor,
  direction,
  children,
}) => {
  const scene = scenes[index];
  // Layering uses the timeline frame from the parent: while Remotion premounts a scene its local
  // frame is frozen at 0, which would otherwise make an upcoming scene look already on screen.
  const localFrame = timelineFrame - scene.from;
  const layer = sceneLayersAt(scenes, timelineFrame, transitionFor, direction).find((item) => item.index === index);
  const visible = Boolean(layer);
  const info: SceneInfo = {
    scene,
    index,
    localFrame,
    progress: scene.durationInFrames <= 1 ? 1 : Math.min(1, Math.max(0, localFrame / (scene.durationInFrames - 1))),
    transition: layer?.transition ?? 0,
    isFirstFrame: localFrame === 0,
    isLastFrame: localFrame === scene.durationInFrames - 1,
  };
  return (
    <SceneContext.Provider value={info}>
      <AbsoluteFill data-scene={scene.id} style={{zIndex: index + 1, visibility: visible ? 'visible' : 'hidden', ...layer?.style}}>
        {children}
      </AbsoluteFill>
    </SceneContext.Provider>
  );
};

/**
 * Renders scenes from a validated timeline (sequenceScenes() or projectTimeline()). Overlaps are
 * transitions: the incoming scene draws on top of the fully opaque outgoing one. Place it inside a
 * camera world container to move every scene with one camera.
 */
export const SceneTimeline: FC<SceneTimelineProps> = ({scenes, children, transition = 'fade', direction = 'ltr', premountFor, durationInFrames}) => {
  const {fps} = useVideoConfig();
  const timelineFrame = useCurrentFrame();
  const issues = validateSceneLayout(scenes, durationInFrames);
  if (issues.length > 0) throw new Error(`Invalid scene timeline: ${issues.map((issue) => issue.message).join(' ')}`);
  const content = (scene: Scene, index: number) => {
    if (typeof children === 'function') return children(scene, index);
    if (!Object.prototype.hasOwnProperty.call(children, scene.id)) throw new Error(`<SceneTimeline> has no content for scene "${scene.id}".`);
    return children[scene.id];
  };
  const transitionFor = typeof transition === 'function' ? transition : () => transition;
  // `isolation` keeps the scene z-indexes inside the timeline, so overlays drawn after it
  // (captions, logos) stay on top instead of disappearing beneath the scenes.
  return (
    <AbsoluteFill style={{isolation: 'isolate'}}>
      {scenes.map((scene, index) => (
        <Sequence key={scene.id} name={scene.id} from={scene.from} durationInFrames={sceneEnd(scene) - scene.from} premountFor={premountFor ?? fps}>
          <SceneLayerView scenes={scenes} index={index} timelineFrame={timelineFrame} transitionFor={transitionFor} direction={direction}>
            {content(scene, index)}
          </SceneLayerView>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
