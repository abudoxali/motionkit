import type {CSSProperties, FC, ReactNode} from 'react';
import {Img, useCurrentFrame} from 'remotion';
import {useCanvas} from '../core/layout';
import {track} from '../core/timeline';
import type {Key} from '../core/timeline';
import type {TextDirection} from '../types';
import {entranceAt, idleAt, poseAt, transformAt} from './geometry';
import type {Entrance, Idle, Point, TransformKey, TransformState} from './geometry';
import type {ImageMetadata} from './manifest';
import {MissingAsset, useAssets, useFailRenderWhenMissing} from './ProjectMedia';

// Owner-supplied character artwork, animated as what it is:
//   • CharacterSprite — one flattened image (or a set of supplied poses swapped at given frames),
//     moved as a whole: position, path, scale, rotation, opacity, idle, entrance/exit. A flattened
//     PNG has no joints; nothing here pretends to bend it.
//   • LayeredCharacter — separately supplied parts (torso, head, arms…) composed in a rig with
//     explicit pivot points and parents, so parts can rotate around their joints.
// The artwork is drawn with uniform scaling only (no stretching), and every value is a function of
// the frame.

export type Placement = {
  /** Anchor position on the canvas, in composition pixels. */
  x: number;
  y: number;
  /** Point of the artwork that sits at (x, y), as fractions; default bottom-centre (feet). */
  anchor?: Point;
  /** Keyframed motion: x/y form a path; scale, rotate (degrees), and opacity animate too. */
  keys?: readonly TransformKey[];
  idle?: Idle;
  enter?: Entrance;
  exit?: Entrance;
  /** Mirror horizontally (a staging choice; the artwork itself is unchanged). */
  flip?: boolean;
  /** A soft ground shadow under the anchor. */
  groundShadow?: boolean;
  direction?: TextDirection;
  style?: CSSProperties;
};

const usePlacement = ({x, y, keys = [], idle, enter, exit, direction = 'ltr'}: Placement) => {
  const frame = useCurrentFrame();
  const canvas = useCanvas();
  const base: TransformState = transformAt(frame, keys, {x, y, scale: 1, rotate: 0, opacity: 1});
  const idleState = idleAt(frame, idle);
  const distance = canvas.vmin * 8;
  const into = entranceAt(frame, enter, 'in', distance);
  const out = exit && frame >= exit.frame ? entranceAt(frame, exit, 'out', distance) : {opacity: 1, x: 0, y: 0, scale: 1};
  const flipSlide = direction === 'rtl' ? -1 : 1;
  return {
    x: base.x + (into.x + out.x) * flipSlide,
    y: base.y + idleState.y + into.y + out.y,
    scale: base.scale * idleState.scale * into.scale * out.scale,
    rotate: base.rotate + idleState.rotate,
    opacity: base.opacity * into.opacity * out.opacity,
    canvas,
  };
};

const Placed: FC<{placement: Placement; width: number; height: number; children: ReactNode; label: string}> = ({placement, width, height, children, label}) => {
  const {x, y, scale, rotate, opacity, canvas} = usePlacement(placement);
  const [ax, ay] = placement.anchor ?? [0.5, 1];
  return (
    <>
      {placement.groundShadow ? (
        <div
          style={{
            position: 'absolute',
            left: x - width * 0.32 * scale,
            top: y - canvas.vmin * 1.2,
            width: width * 0.64 * scale,
            height: canvas.vmin * 2.4,
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(0,0,0,0.28), rgba(0,0,0,0))',
            opacity,
          }}
        />
      ) : null}
      <div
        data-character={label}
        style={{
          position: 'absolute',
          left: x - ax * width,
          top: y - ay * height,
          width,
          height,
          opacity,
          transformOrigin: `${ax * 100}% ${ay * 100}%`,
          transform: `rotate(${rotate}deg) scale(${placement.flip ? -scale : scale}, ${scale})`,
          ...placement.style,
        }}
      >
        {children}
      </div>
    </>
  );
};

export type Pose = {asset: string; from: number};

export type CharacterSpriteProps = Placement & {
  /** One flattened image, or use `poses` for supplied pose variants. */
  asset?: string;
  /** Supplied poses; each shows from its frame until the next pose. */
  poses?: readonly Pose[];
  /** Drawn height in composition pixels; the width follows the artwork's own aspect. */
  height: number;
};

export const CharacterSprite: FC<CharacterSpriteProps> = ({asset, poses, height, ...placement}) => {
  const frame = useCurrentFrame();
  const list = poses && poses.length > 0 ? poses : [{asset: asset ?? '', from: 0}];
  const active = list[poseAt(frame, list)];
  // Every pose is resolved (not just the active one) so a missing pose fails before it is reached.
  const states = useAssets(list.map((pose) => pose.asset), {kind: 'image'});
  const missing = states.find((state) => state.status === 'missing') ?? {status: 'ready'};
  useFailRenderWhenMissing(missing);
  const current = states[list.indexOf(active)];
  if (states.some((state) => state.status === 'loading')) return null;
  if (missing.status === 'missing' || current.status !== 'ready') {
    const width = height * 0.6;
    return (
      <Placed placement={placement} width={width} height={height} label={active.asset}>
        <MissingAsset reason={'reason' in missing ? missing.reason : 'pose unavailable'} style={{fontSize: Math.max(14, height * 0.03)}} />
      </Placed>
    );
  }
  const meta = current.asset.metadata as ImageMetadata;
  const width = height * (meta.width / meta.height);
  return (
    <Placed placement={placement} width={width} height={height} label={active.asset}>
      <Img src={current.src} alt="" style={{width: '100%', height: '100%', display: 'block'}} />
    </Placed>
  );
};

export type LayerRotation = number | readonly Key[] | {swing: number; period?: number; phase?: number; rest?: number};

export type CharacterLayer = {
  id: string;
  asset: string;
  /** Top-left of the part in its parent's space (rig pixels; the rig root is `size`). */
  x: number;
  y: number;
  /** Width in rig pixels; height follows the part's aspect. */
  width: number;
  /** Joint position as fractions of the part (e.g. [0.5, 0.1] for a shoulder at the top). */
  pivot?: Point;
  /** Parent layer id: the part moves and rotates with its parent. */
  parent?: string;
  /** Draw order among siblings; negative draws behind the parent part. */
  z?: number;
  /** Degrees: a constant, keyframes ([frame, degrees]), or a periodic swing. */
  rotate?: LayerRotation;
};

const rotationAt = (frame: number, rotate: LayerRotation | undefined) => {
  if (rotate === undefined) return 0;
  if (typeof rotate === 'number') return rotate;
  if (Array.isArray(rotate)) return rotate.length ? track(frame, rotate as readonly Key[]) : 0;
  const swing = rotate as {swing: number; period?: number; phase?: number; rest?: number};
  return (swing.rest ?? 0) + Math.sin(((frame + (swing.phase ?? 0)) / Math.max(1, swing.period ?? 60)) * Math.PI * 2) * swing.swing;
};

export type LayeredCharacterProps = Placement & {
  /** Rig canvas the layer coordinates refer to. */
  size: {width: number; height: number};
  /** Drawn height in composition pixels (the rig is scaled uniformly). */
  height: number;
  layers: readonly CharacterLayer[];
};

/** Validates a rig: unique ids, known parents, no cycles. Pure, for tests and early errors. */
export const rigIssues = (layers: readonly CharacterLayer[]): string[] => {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const layer of layers) {
    if (ids.has(layer.id)) issues.push(`duplicate layer id "${layer.id}"`);
    ids.add(layer.id);
  }
  for (const layer of layers) {
    if (layer.parent && !ids.has(layer.parent)) issues.push(`layer "${layer.id}" has unknown parent "${layer.parent}"`);
    const seen = new Set<string>([layer.id]);
    let parent = layer.parent;
    while (parent) {
      if (seen.has(parent)) {
        issues.push(`layer "${layer.id}" is part of a parent cycle`);
        break;
      }
      seen.add(parent);
      parent = layers.find((item) => item.id === parent)?.parent;
    }
  }
  return issues;
};

export const LayeredCharacter: FC<LayeredCharacterProps> = ({size, height, layers, ...placement}) => {
  const frame = useCurrentFrame();
  const states = useAssets(layers.map((layer) => layer.asset), {kind: 'image'});
  const structural = rigIssues(layers);
  const missingIndex = states.findIndex((state) => state.status === 'missing');
  const problem: {status: string; reason?: string} = structural.length
    ? {status: 'missing', reason: `invalid character rig: ${structural.join('; ')}`}
    : missingIndex >= 0
      ? {status: 'missing', reason: `character layer "${layers[missingIndex].id}": ${(states[missingIndex] as {reason: string}).reason}`}
      : {status: 'ready'};
  useFailRenderWhenMissing(problem);
  const scale = height / size.height;
  const width = size.width * scale;
  if (states.some((state) => state.status === 'loading')) return null;
  if (structural.length) {
    return (
      <Placed placement={placement} width={width} height={height} label="rig">
        <MissingAsset reason={problem.reason ?? ''} style={{fontSize: Math.max(14, height * 0.03)}} />
      </Placed>
    );
  }

  const renderLayer = (layer: CharacterLayer, index: number): ReactNode => {
    const state = states[index];
    const [px, py] = layer.pivot ?? [0.5, 0.5];
    const aspect = state.status === 'ready' ? (state.asset.metadata as ImageMetadata).width / (state.asset.metadata as ImageMetadata).height : 1;
    const layerHeight = layer.width / aspect;
    const children = layers.map((item, childIndex) => ({item, childIndex})).filter(({item}) => item.parent === layer.id).sort((a, b) => (a.item.z ?? 0) - (b.item.z ?? 0));
    const behind = children.filter(({item}) => (item.z ?? 0) < 0);
    const front = children.filter(({item}) => (item.z ?? 0) >= 0);
    return (
      <div
        key={layer.id}
        data-layer={layer.id}
        style={{
          position: 'absolute',
          left: layer.x,
          top: layer.y,
          width: layer.width,
          height: layerHeight,
          transformOrigin: `${px * 100}% ${py * 100}%`,
          transform: `rotate(${rotationAt(frame, layer.rotate)}deg)`,
        }}
      >
        {behind.map(({item, childIndex}) => renderLayer(item, childIndex))}
        {state.status === 'ready' ? (
          <Img src={state.src} alt="" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
        ) : (
          <MissingAsset reason={state.status === 'missing' ? state.reason : 'loading'} style={{fontSize: 12 / scale}} />
        )}
        {front.map(({item, childIndex}) => renderLayer(item, childIndex))}
      </div>
    );
  };

  const roots = layers.map((item, index) => ({item, index})).filter(({item}) => !item.parent).sort((a, b) => (a.item.z ?? 0) - (b.item.z ?? 0));
  return (
    <Placed placement={placement} width={width} height={height} label="rig">
      <div style={{position: 'absolute', left: 0, top: 0, width: size.width, height: size.height, transformOrigin: '0 0', transform: `scale(${scale})`}}>
        {roots.map(({item, index}) => renderLayer(item, index))}
      </div>
    </Placed>
  );
};
