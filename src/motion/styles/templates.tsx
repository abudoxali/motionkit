import {useMemo} from 'react';
import type {CSSProperties, FC, ReactNode} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {StyleId} from '../../projects/contract';
import type {TextDirection} from '../types';
import {canvasMetrics} from '../core/layout';
import {ease, springAt} from '../core/easing';
import {bump, mix, progress} from '../core/timeline';
import {FittedText, dominantDirection} from '../typography';
import type {TypeLevel} from '../typography';

/**
 * Reusable scenes, not exported videos. Each style keeps its own drawing grammar and motion:
 * a signal traced on a measured grid; an inked character walking through one landscape; a marker
 * constructing a diagram; or a counted chalk proof. Every value is computed from the frame.
 */
export const STYLE_SCENE_ROLES = ['title', 'explainer', 'end-card'] as const;
export type StyleSceneRole = (typeof STYLE_SCENE_ROLES)[number];
/** Length of a standalone style-scene preview (library and QA harness); scenes settle well before it. */
export const STYLE_SCENE_PREVIEW_FRAMES = 120;
/** First frame at which every style and role has finished its entrance; used as a preview poster. */
export const STYLE_SCENE_SETTLED_FRAME = 90;

export type StyleSceneProps = {
  styleId: StyleId;
  role: StyleSceneRole;
  text: string;
  secondaryText?: string;
  /** Reading direction of the layout and headline; detected from the headline when omitted. */
  direction?: TextDirection;
  accent?: string;
};

export type StyleTheme = {
  background: string;
  foreground: string;
  accent: string;
  supporting: string;
  stroke: string;
  movement: 'signal' | 'character' | 'marker' | 'chalk';
};

export const styleThemes: Record<StyleId, StyleTheme> = {
  plotter: {
    background: '#101317', foreground: '#f0ede6', accent: '#ff7a2f',
    supporting: '#b0bac5', stroke: '#577086', movement: 'signal',
  },
  doodle: {
    background: '#b6dff0', foreground: '#30271e', accent: '#f07f2e',
    supporting: '#49546a', stroke: '#3a2a1e', movement: 'character',
  },
  whiteboard: {
    background: '#f7f7f3', foreground: '#23272e', accent: '#1e63d6',
    supporting: '#56636e', stroke: '#252a31', movement: 'marker',
  },
  chalkboard: {
    background: '#17302a', foreground: '#f3f1e7', accent: '#f6e07a',
    supporting: '#c4d9d1', stroke: '#9ad3f0', movement: 'chalk',
  },
};

export const getStyleTheme = (id: StyleId) => {
  if (!Object.prototype.hasOwnProperty.call(styleThemes, id)) throw new Error(`Unknown style: ${id}`);
  return styleThemes[id];
};

/** Role of the n-th scene in a timeline: opening title, explainer beats, closing end card. */
export const styleSceneRoleFor = (index: number, count: number): StyleSceneRole =>
  index === 0 ? 'title' : index === count - 1 ? 'end-card' : 'explainer';

// ---------------------------------------------------------------------------------------------
// Layout: a pure function of style, role, canvas, and direction, so it is unit-tested directly.

export type SceneRect = {x: number; y: number; width: number; height: number};

type TextSpec = {level: TypeLevel; minSize: number; maxSize: number; maxLines: number; boxHeight: number};

export type StyleSceneLayout = {
  /** How text and drawing share the safe area. */
  arrangement: 'side' | 'top' | 'center' | 'boxed';
  text: SceneRect;
  /** Region of the style drawing; for `boxed` it surrounds the text on purpose. */
  art: SceneRect;
  align: 'start' | 'center';
  verticalAlign: 'start' | 'center';
  gap: number;
  /** 1% of the shorter canvas side, the unit for strokes and motion distances. */
  unit: number;
  headline: TextSpec;
  supporting: TextSpec;
};

const ARRANGEMENTS: Record<StyleId, Record<StyleSceneRole, StyleSceneLayout['arrangement']>> = {
  // Editorial: the title shares the frame with the signal; the explainer gives the plot the width.
  plotter: {title: 'side', explainer: 'top', 'end-card': 'center'},
  // Captions at the top over one persistent landscape, in every role.
  doodle: {title: 'top', explainer: 'top', 'end-card': 'top'},
  whiteboard: {title: 'side', explainer: 'top', 'end-card': 'center'},
  // The conclusion is boxed in chalk, the way a proof ends.
  chalkboard: {title: 'side', explainer: 'top', 'end-card': 'boxed'},
};

/**
 * Type sizes in units of 1% of the shorter canvas side, so a 960×540 library preview is an exact
 * half-scale of the 1920×1080 composition. (Absolute pixel floors made the 16:9 preview headline
 * box shorter than one Cairo line at the floor size, which reported overflow.)
 */
const TYPE: Record<StyleSceneRole, {headline: Omit<TextSpec, 'boxHeight'>; supporting: Omit<TextSpec, 'boxHeight' | 'level'>; share: number}> = {
  title: {headline: {level: 'display', minSize: 4.6, maxSize: 11, maxLines: 3}, supporting: {minSize: 2.4, maxSize: 3.8, maxLines: 2}, share: 0.66},
  explainer: {headline: {level: 'heading', minSize: 3.6, maxSize: 7.4, maxLines: 3}, supporting: {minSize: 2.4, maxSize: 3.8, maxLines: 3}, share: 0.54},
  'end-card': {headline: {level: 'display', minSize: 4.6, maxSize: 10, maxLines: 3}, supporting: {minSize: 2.4, maxSize: 3.6, maxLines: 2}, share: 0.64},
};

export const styleSceneLayout = (
  styleId: StyleId,
  role: StyleSceneRole,
  width: number,
  height: number,
  direction: TextDirection,
): StyleSceneLayout => {
  getStyleTheme(styleId);
  if (!STYLE_SCENE_ROLES.includes(role)) throw new Error(`Unknown style scene role: ${String(role)}`);
  const {safeRect: s, orientation, vmin} = canvasMetrics(width, height);
  const portrait = orientation === 'portrait';
  const landscape = orientation === 'landscape';
  const arrangement = ARRANGEMENTS[styleId][role];
  const gap = Math.round(s.height * (portrait ? 0.04 : 0.06));
  const rect = (x: number, y: number, w: number, h: number): SceneRect => ({x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h)});
  let text: SceneRect;
  let art: SceneRect;
  let align: StyleSceneLayout['align'] = 'start';
  let verticalAlign: StyleSceneLayout['verticalAlign'] = 'start';

  if (arrangement === 'side' && landscape) {
    // Text on the reading-start side, drawing on the other.
    const textWidth = s.width * 0.55;
    const artWidth = s.width * 0.39;
    const textOnRight = direction === 'rtl';
    text = rect(textOnRight ? s.x + s.width - textWidth : s.x, s.y + s.height * 0.06, textWidth, s.height * 0.88);
    art = rect(textOnRight ? s.x : s.x + s.width - artWidth, s.y + s.height * 0.06, artWidth, s.height * 0.88);
    verticalAlign = 'center';
  } else if (arrangement === 'side') {
    // Stacked formats: the drawing opens the frame, the headline lands below it.
    const artHeight = s.height * (portrait ? 0.44 : 0.42);
    art = rect(s.x, s.y, s.width, artHeight);
    text = rect(s.x, s.y + artHeight + gap, s.width, s.height - artHeight - gap);
  } else if (arrangement === 'top') {
    const share = {title: portrait ? 0.36 : 0.4, explainer: portrait ? 0.3 : 0.36, 'end-card': portrait ? 0.34 : 0.38}[role];
    // A readable measure in wide frames: the caption keeps to the reading-start side (centred on
    // end cards) instead of running across the whole width.
    const measure = landscape ? s.width * 0.72 : s.width;
    const textX = role === 'end-card' ? s.x + (s.width - measure) / 2 : direction === 'rtl' ? s.x + s.width - measure : s.x;
    text = rect(textX, s.y, measure, s.height * share);
    art = rect(s.x, s.y + s.height * share + gap, s.width, s.height * (1 - share) - gap);
    if (role === 'end-card') align = 'center';
  } else if (arrangement === 'center') {
    const emblemWidth = s.width * (landscape ? 0.5 : 0.8);
    const emblemTop = s.y + (portrait ? s.height * 0.12 : orientation === 'square' ? s.height * 0.04 : 0);
    const emblemHeight = s.height * (portrait ? 0.3 : 0.36);
    art = rect(s.x + (s.width - emblemWidth) / 2, emblemTop, emblemWidth, emblemHeight);
    const textTop = emblemTop + emblemHeight + gap;
    text = rect(s.x, textTop, s.width, s.y + s.height - textTop);
    align = 'center';
  } else {
    art = rect(s.x + s.width * 0.04, s.y + s.height * 0.14, s.width * 0.92, s.height * 0.72);
    const padX = vmin * 5;
    const padY = Math.max(vmin * 5, art.height * 0.1);
    text = rect(art.x + padX, art.y + padY, art.width - padX * 2, art.height - padY * 2);
    align = 'center';
    verticalAlign = 'center';
  }

  const type = TYPE[role];
  const textGap = Math.round(text.height * 0.04);
  const headlineBox = Math.floor(text.height * type.share);
  const size = (value: number) => Math.round(value * vmin * 10) / 10;
  return {
    arrangement, text, art, align, verticalAlign, gap: textGap, unit: vmin,
    headline: {
      ...type.headline,
      maxLines: role === 'explainer' && landscape ? 2 : type.headline.maxLines,
      minSize: size(type.headline.minSize), maxSize: size(type.headline.maxSize), boxHeight: headlineBox,
    },
    supporting: {
      ...type.supporting, level: 'body',
      minSize: size(type.supporting.minSize), maxSize: size(type.supporting.maxSize),
      boxHeight: text.height - headlineBox - textGap,
    },
  };
};

// ---------------------------------------------------------------------------------------------
// Drawing helpers. Strokes are sampled polylines, so the drawing tip (marker, tracer, chalk) is
// known exactly at every frame instead of guessed from a dash offset.

type Point = readonly [number, number];

const sample = (count: number, at: (t: number) => Point): Point[] =>
  Array.from({length: count + 1}, (_, index) => at(index / count));

const lengthOf = (points: readonly Point[]) =>
  points.reduce((sum, point, index) => (index === 0 ? 0 : sum + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1])), 0);

const toPath = (points: readonly Point[]) =>
  points.length < 2 ? '' : `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;

/** The first `amount` (0..1, by length) of a polyline, and where its tip is. */
const partial = (points: readonly Point[], amount: number): {d: string; tip: Point} => {
  if (amount <= 0) return {d: '', tip: points[0]};
  let remaining = lengthOf(points) * Math.min(1, amount);
  const drawn: Point[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const [ax, ay] = points[index - 1];
    const [bx, by] = points[index];
    const segment = Math.hypot(bx - ax, by - ay);
    if (remaining >= segment) {
      drawn.push(points[index]);
      remaining -= segment;
    } else {
      const t = segment === 0 ? 0 : remaining / segment;
      drawn.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      break;
    }
  }
  return {d: toPath(drawn), tip: drawn[drawn.length - 1]};
};

/** Strokes drawn one after another at constant pen speed; `amount` covers the whole sequence. */
const sequence = (strokes: readonly (readonly Point[])[], amount: number) => {
  const lengths = strokes.map(lengthOf);
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  let start = 0;
  let tip: Point = strokes[0][0];
  const parts = strokes.map((stroke, index) => {
    const local = Math.max(0, Math.min(1, (amount * total - start) / (lengths[index] || 1)));
    start += lengths[index];
    const part = partial(stroke, local);
    if (local > 0) tip = part.tip;
    return {...part, done: amount >= 1 || local >= 1 - 1e-9};
  });
  return {parts, tip};
};

/**
 * Overshooting pop-in scale. Clamped at zero: the eased value is a hair below 0 at the start
 * (≈ -1e-15), and a negative SVG radius or size is invalid and logged by the browser.
 */
const popIn = (frame: number, from: number, to: number) => Math.max(0, progress(frame, from, to, ease.overshoot));

const rectPoints = (x: number, y: number, w: number, h: number): Point[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

type DrawingProps = {
  frame: number;
  fps: number;
  role: StyleSceneRole;
  layout: StyleSceneLayout;
  width: number;
  height: number;
  /** 1% of the shorter canvas side; every stroke width is expressed in it. */
  u: number;
  direction: TextDirection;
  accent: string;
  theme: StyleTheme;
};

/** Horizontal position inside a rect that runs forward in reading direction (0 = start side). */
const forward = (area: SceneRect, direction: TextDirection) => (t: number) =>
  direction === 'rtl' ? area.x + area.width * (1 - t) : area.x + area.width * t;
const down = (area: SceneRect) => (v: number) => area.y + area.height * v;

// ---------------------------------------------------------------------------------------------
// Plotter Signal: one bright signal traced on a measured grid, a tracer that rides its tip.

const PlotterDrawing: FC<DrawingProps> = ({frame, fps, role, layout, u, direction, accent, theme}) => {
  const {art} = layout;
  const X = forward(art, direction);
  const Y = down(art);
  const reveal = progress(frame, 4, 4 + fps * 0.75, ease.smooth);
  const tracer = (tip: Point, visible = true) => visible ? (
    <g>
      <circle cx={tip[0]} cy={tip[1]} r={u * 2.4} fill={accent} opacity={0.18} />
      <circle cx={tip[0]} cy={tip[1]} r={u * 1.1} fill={accent} />
    </g>
  ) : null;

  if (role === 'end-card') {
    // The signal arrives at a reticle and locks on.
    const cx = art.x + art.width / 2;
    const cy = art.y + art.height / 2;
    const radius = Math.min(art.width, art.height) * 0.42;
    const ring = progress(frame, 2, 2 + fps * 0.6, ease.smooth);
    const startX = direction === 'rtl' ? art.x + art.width : art.x;
    const path = sample(60, (t) => [mix(startX, cx, t), cy + Math.sin(t * Math.PI * 4) * (1 - t) * radius * 0.6]);
    const signal = partial(path, reveal);
    const lock = progress(frame, 4 + fps * 0.75, 4 + fps * 0.75 + 10, ease.crash);
    return (
      <g fill="none">
        {[1, 0.58].map((scale) => (
          <circle key={scale} cx={cx} cy={cy} r={radius * scale} stroke={theme.stroke} strokeWidth={u * 0.35}
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} />
        ))}
        <path d={`M${cx - radius * 1.15} ${cy} H${cx + radius * 1.15} M${cx} ${cy - radius * 1.15} V${cy + radius * 1.15}`}
          stroke={theme.stroke} strokeWidth={u * 0.2} strokeDasharray={`${u} ${u * 0.8}`} opacity={ring} />
        <path d={signal.d} stroke={accent} strokeWidth={u * 0.9} strokeLinecap="round" strokeLinejoin="round" />
        {tracer(signal.tip, lock < 1)}
        <circle cx={cx} cy={cy} r={radius * 0.16 * lock} fill={accent} />
        <circle cx={cx} cy={cy} r={radius * (0.16 + 0.5 * lock)} stroke={accent} strokeWidth={u * 0.4} opacity={(1 - lock) * 0.8} />
      </g>
    );
  }

  const axis = (
    <g fill="none" stroke={theme.stroke}>
      <path d={`M${X(0.02)} ${Y(0.04)} V${Y(0.9)} H${X(0.98)}`} strokeWidth={u * 0.3} />
      {[1, 2, 3, 4].map((index) => (
        <path key={index} d={`M${X(0.02 + index * 0.24)} ${Y(0.06)} V${Y(0.9) + u * 1.2}`} strokeWidth={u * 0.15}
          strokeDasharray={`${u * 0.6} ${u * 0.9}`} opacity={0.7} />
      ))}
    </g>
  );

  if (role === 'explainer') {
    // A plotted series: points appear, counted, as the tracer reaches them.
    const values = [0.74, 0.6, 0.66, 0.44, 0.36, 0.16];
    const points = values.map((value, index): Point => [X(0.08 + index * 0.17), Y(value)]);
    const series = partial(points, reveal);
    const total = lengthOf(points);
    return (
      <g>
        {axis}
        <path d={series.d} fill="none" stroke={accent} strokeWidth={u * 0.8} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => {
          const reachedAt = lengthOf(points.slice(0, index + 1)) / total;
          const pop = reveal >= reachedAt ? popIn(frame, 4 + fps * 0.75 * reachedAt, 4 + fps * 0.75 * reachedAt + 8) : 0;
          return (
            <g key={index} opacity={Math.min(1, pop * 1.5)}>
              <path d={`M${point[0]} ${point[1]} V${Y(0.9)}`} stroke={theme.stroke} strokeWidth={u * 0.18} strokeDasharray={`${u * 0.5} ${u * 0.5}`} />
              <circle cx={point[0]} cy={point[1]} r={u * (index === points.length - 1 ? 1.5 : 1) * pop} fill={index === points.length - 1 ? accent : theme.foreground} />
            </g>
          );
        })}
        {tracer(series.tip, reveal < 1)}
      </g>
    );
  }

  // Title: a rising signal with its peak measured once the trace completes.
  const wave = sample(64, (t) => [X(0.04 + t * 0.92), Y(0.56 - Math.sin(t * Math.PI * 2.3 + 0.3) * 0.3 * (0.35 + 0.65 * t))]);
  const signal = partial(wave, reveal);
  const peak = wave.reduce((best, point) => (point[1] < best[1] ? point : best));
  const measured = progress(frame, 4 + fps * 0.75, 4 + fps * 1.1, ease.snap);
  return (
    <g>
      {axis}
      <path d={`M${X(0.02)} ${peak[1]} H${X(0.98)}`} stroke={accent} strokeWidth={u * 0.2} strokeDasharray={`${u} ${u * 0.7}`}
        opacity={measured * 0.8} fill="none" />
      <path d={signal.d} fill="none" stroke={accent} strokeWidth={u * 0.9} strokeLinecap="round" strokeLinejoin="round" />
      {tracer(signal.tip)}
      <circle cx={peak[0]} cy={peak[1]} r={u * 2.2 * measured} fill="none" stroke={accent} strokeWidth={u * 0.3} />
    </g>
  );
};

// ---------------------------------------------------------------------------------------------
// Doodle Journey: an inked character in one continuous landscape; the walk follows distance.

type CharacterPose = {x: number; y: number; scale: number; facing: 1 | -1; legSwing: number; armBack: number; armFront: number; ink: string};

/** Limb angles in degrees from straight down, positive toward the facing direction. */
const DoodleCharacter: FC<CharacterPose> = ({x, y, scale, facing, legSwing, armBack, armFront, ink}) => {
  const hand = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return `${(Math.sin(radians) * 62).toFixed(1)} ${(-150 + Math.cos(radians) * 62).toFixed(1)}`;
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${scale * facing} ${scale})`} stroke={ink} strokeWidth={8}
      strokeLinecap="round" strokeLinejoin="round">
      <path d={`M0 -95 L${(-16 + legSwing * 24).toFixed(1)} 0 M0 -95 L${(16 - legSwing * 24).toFixed(1)} 0`} fill="none" />
      <path d={`M0 -150 L${hand(armBack)}`} fill="none" />
      <path d="M-34 -164 Q0 -182 34 -164 L31 -92 H-31Z" fill="#bcdb92" />
      <path d={`M0 -150 L${hand(armFront)}`} fill="none" />
      <circle cx={0} cy={-212} r={42} fill="#f1d9ae" />
      <circle cx={12} cy={-218} r={4} fill={ink} stroke="none" />
      <circle cx={30} cy={-218} r={4} fill={ink} stroke="none" />
      <path d="M10 -196 Q22 -186 34 -198" fill="none" strokeWidth={5} />
    </g>
  );
};

const DoodleDrawing: FC<DrawingProps> = ({frame, fps, role, layout, width, height, u, direction, accent, theme}) => {
  const {art} = layout;
  const X = forward(art, direction);
  const ground = art.y + art.height * 0.88;
  const scale = Math.min(art.height * 0.6, art.width * 0.42) / 254;
  const facing = direction === 'rtl' ? -1 : 1;
  const stride = scale * 70;
  // A slow, bounded sway: clouds never leave the sky however long the scene runs.
  const drift = Math.sin((frame / fps) * 0.6) * u * 3 * facing;

  let character: ReactNode;
  let props: ReactNode;
  if (role === 'end-card') {
    // Arrives at the flag, then celebrates with two jumps and settles.
    const jump = bump(frame, fps * 0.5, fps * 0.95) + bump(frame, fps * 0.95, fps * 1.4) * 0.6;
    const cheer = progress(frame, fps * 0.3, fps * 0.55, ease.snap);
    character = <DoodleCharacter x={X(0.42)} y={ground - jump * scale * 60} scale={scale} facing={facing} legSwing={jump * 0.5}
      armBack={mix(-20, -125, cheer)} armFront={mix(20, 125, cheer)} ink={theme.stroke} />;
    const flagX = X(0.66);
    const rise = springAt(frame, fps, 'bouncy', 4);
    const wave = Math.sin(frame / 5) * scale * 10;
    props = (
      <g stroke={theme.stroke} strokeWidth={u * 0.6} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${flagX} ${ground} V${ground - scale * 280 * rise}`} fill="none" />
        <path d={`M${flagX} ${ground - scale * 280 * rise} l${facing * scale * 110} ${scale * 34 + wave} l${-facing * scale * 110} ${scale * 34 - wave}Z`}
          fill={accent} opacity={rise > 0.05 ? 1 : 0} />
      </g>
    );
  } else {
    const explainer = role === 'explainer';
    const travel = progress(frame, 0, fps * (explainer ? 2.2 : 1.2), explainer ? ease.drift : ease.snap);
    const from = explainer ? 0.1 : 0.06;
    const to = explainer ? 0.6 : 0.3;
    const x = X(mix(from, to, travel));
    const distance = Math.abs(X(from) - x);
    const walking = 1 - progress(frame, fps * (explainer ? 2.0 : 1.0), fps * (explainer ? 2.3 : 1.3));
    const legSwing = Math.sin(distance / stride * Math.PI) * walking;
    const wave = explainer ? 0 : progress(frame, fps * 1.2, fps * 1.5) * (150 + Math.sin(frame / 3.5) * 20);
    character = <DoodleCharacter x={x} y={ground} scale={scale} facing={facing} legSwing={legSwing}
      armBack={-legSwing * 25} armFront={explainer ? 70 : Math.max(legSwing * 25, wave)} ink={theme.stroke} />;
    if (explainer) {
      // Carries an idea along a dashed trail toward a house.
      const glow = progress(frame, fps * 0.6, fps * 1.0);
      const bulbX = x + facing * scale * 92;
      const bulbY = ground - scale * 245;
      const houseX = X(0.86);
      const size = scale * 150;
      props = (
        <g stroke={theme.stroke} strokeWidth={u * 0.5} strokeLinejoin="round" strokeLinecap="round">
          <path d={`M${X(from)} ${ground - u * 0.5} H${x}`} stroke={accent} strokeWidth={u * 0.7} strokeDasharray={`${u * 1.6} ${u * 1.2}`} fill="none" />
          <path d={`M${houseX - size / 2} ${ground} V${ground - size} H${houseX + size / 2} V${ground}`} fill="#fff9e9" />
          <path d={`M${houseX - size * 0.62} ${ground - size} L${houseX} ${ground - size * 1.6} L${houseX + size * 0.62} ${ground - size}Z`} fill={accent} />
          <path d={`M${houseX - size * 0.14} ${ground} V${ground - size * 0.46} H${houseX + size * 0.14} V${ground}`} fill="#bcdb92" />
          <circle cx={bulbX} cy={bulbY} r={scale * 46 * (1 + glow * 0.5)} fill="#ffdf8e" stroke="none" opacity={glow * 0.45} />
          <circle cx={bulbX} cy={bulbY} r={scale * 30} fill="#ffdf8e" />
          <path d={`M${bulbX - scale * 12} ${bulbY + scale * 36} h${scale * 24}`} fill="none" />
        </g>
      );
    } else {
      // A signpost pointing forward pops up beside the waving character.
      const pop = springAt(frame, fps, 'bouncy', 6);
      const postX = X(0.68);
      const top = ground - scale * 230 * pop;
      const board = scale * 150;
      props = (
        <g stroke={theme.stroke} strokeWidth={u * 0.55} strokeLinejoin="round" strokeLinecap="round" opacity={pop > 0.02 ? 1 : 0}>
          <path d={`M${postX} ${ground} V${top}`} fill="none" />
          <path d={`M${postX - facing * board * 0.4} ${top} h${facing * board} l${facing * scale * 34} ${scale * 34} l${-facing * scale * 34} ${scale * 34} h${-facing * board}Z`} fill={accent} />
        </g>
      );
    }
  }

  const sunX = X(0.9);
  const sunY = art.y + art.height * 0.16;
  const sunRadius = u * 4.2;
  return (
    <g>
      <g transform={`rotate(${(frame * 0.6).toFixed(1)} ${sunX} ${sunY})`} stroke="#ffcf5c" strokeWidth={u * 0.5} strokeLinecap="round">
        {Array.from({length: 8}, (_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          return <path key={index} d={`M${sunX + Math.cos(angle) * sunRadius * 1.35} ${sunY + Math.sin(angle) * sunRadius * 1.35} L${sunX + Math.cos(angle) * sunRadius * 1.7} ${sunY + Math.sin(angle) * sunRadius * 1.7}`} />;
        })}
      </g>
      <circle cx={sunX} cy={sunY} r={sunRadius} fill="#ffdf8e" />
      <path d={`M${X(0.12) + drift} ${art.y + art.height * 0.22} q${u * 6} ${-u * 4} ${u * 12} 0`} stroke="#fff9e9" strokeWidth={u * 2.4}
        strokeLinecap="round" fill="none" />
      <path d={`M0 ${ground} Q${width * 0.25} ${ground - u * 3} ${width * 0.5} ${ground} T${width} ${ground} V${height} H0Z`} fill="#efd8ad" />
      <path d={`M0 ${ground} Q${width * 0.25} ${ground - u * 3} ${width * 0.5} ${ground} T${width} ${ground}`} fill="none" stroke={theme.stroke}
        strokeWidth={u * 0.45} />
      {props}
      {character}
    </g>
  );
};

// ---------------------------------------------------------------------------------------------
// Whiteboard Logic: a marker constructs one diagram; the pen sits on the stroke it is drawing.

const Marker: FC<{tip: Point; u: number; accent: string; ink: string; opacity: number}> = ({tip, u, accent, ink, opacity}) => (
  <g transform={`translate(${tip[0]} ${tip[1]}) rotate(-35) scale(${u / 10})`} opacity={opacity} stroke={ink} strokeWidth={2.5}
    strokeLinejoin="round">
    <path d="M0 0 L-9 -22 H9Z" fill="#d8b88d" />
    <rect x={-11} y={-108} width={22} height={88} rx={5} fill={accent} />
    <rect x={-11} y={-108} width={22} height={18} rx={5} fill={ink} />
  </g>
);

const WhiteboardDrawing: FC<DrawingProps> = ({frame, fps, role, layout, u, direction, accent, theme}) => {
  const {art} = layout;
  const X = forward(art, direction);
  const cx = art.x + art.width / 2;
  const cy = art.y + art.height / 2;
  const k = Math.min(art.width, art.height);
  const ink = theme.stroke;
  let strokes: Point[][];
  let fills: (parts: ReturnType<typeof sequence>['parts']) => ReactNode;
  let duration = 1.6;

  if (role === 'explainer') {
    // Three steps joined by arrows: in reading order across a wide area, top to bottom in a tall
    // one. Each step counts its dots once drawn.
    const stacked = art.height > art.width * 0.9;
    const boxWidth = stacked ? art.width * 0.5 : Math.min(art.width * 0.24, k * 0.9);
    const boxHeight = stacked ? art.height * 0.2 : Math.min(art.height * 0.5, boxWidth * 0.8);
    const centers = [0.14, 0.5, 0.86].map((t): Point => (stacked ? [cx, art.y + art.height * t] : [X(t), cy]));
    const boxes = centers.map(([x, y]) => rectPoints(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight));
    const head = u * 2.4;
    const arrows = [0, 1].map((index): Point[] => {
      if (stacked) {
        const from = centers[index][1] + boxHeight / 2 + u * 1.5;
        const to = centers[index + 1][1] - boxHeight / 2 - u * 1.5;
        return [[cx, from], [cx, to], [cx - head * 0.8, to - head], [cx, to], [cx + head * 0.8, to - head]];
      }
      const sign = direction === 'rtl' ? -1 : 1;
      const from = centers[index][0] + sign * (boxWidth / 2 + u * 1.5);
      const to = centers[index + 1][0] - sign * (boxWidth / 2 + u * 1.5);
      return [[from, cy], [to, cy], [to - sign * head, cy - head * 0.8], [to, cy], [to - sign * head, cy + head * 0.8]];
    });
    strokes = [boxes[0], arrows[0], boxes[1], arrows[1], boxes[2]];
    duration = 1.8;
    fills = (parts) => [0, 2, 4].map((part, index) => parts[part].done ? (
      <g key={part}>
        <rect x={centers[index][0] - boxWidth / 2} y={centers[index][1] - boxHeight / 2} width={boxWidth} height={boxHeight} fill={accent} opacity={0.1} />
        {Array.from({length: index + 1}, (_, dot) => (
          <circle key={dot} cx={centers[index][0] + (direction === 'rtl' ? -1 : 1) * (dot - index / 2) * u * 3.4} cy={centers[index][1]}
            r={u * 1.1} fill={dot === index ? accent : ink} />
        ))}
      </g>
    ) : null);
  } else if (role === 'end-card') {
    // A box is drawn and checked.
    const side = k * 0.62;
    const box = rectPoints(cx - side / 2, cy - side / 2, side, side);
    const sign = direction === 'rtl' ? -1 : 1;
    const check: Point[] = [[cx - sign * side * 0.28, cy], [cx - sign * side * 0.06, cy + side * 0.22], [cx + sign * side * 0.32, cy - side * 0.26]];
    strokes = [box, check];
    duration = 1.1;
    fills = () => null;
  } else {
    // Title: a mind map, a circled idea with three branches.
    const rx = Math.min(art.width * 0.2, k * 0.26);
    const ry = Math.min(art.height * 0.14, k * 0.18);
    const ellipse = sample(48, (t) => {
      const angle = -Math.PI * 0.6 + t * Math.PI * 2.08;
      const wobble = 1 + Math.sin(t * 9) * 0.03;
      return [cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble];
    });
    const nodeWidth = k * 0.2;
    const nodeHeight = k * 0.13;
    const branches = [[0.86, 0.14], [0.86, 0.86], [0.12, 0.5]].map(([t, v]) => [X(t), art.y + art.height * v] as const);
    strokes = [ellipse];
    for (const [nx, ny] of branches) {
      const angle = Math.atan2(ny - cy, nx - cx);
      const edge: Point = [cx + Math.cos(angle) * rx * 1.05, cy + Math.sin(angle) * ry * 1.05];
      const end: Point = [nx - Math.cos(angle) * nodeWidth * 0.55, ny - Math.sin(angle) * nodeHeight * 0.6];
      strokes.push([edge, end]);
      strokes.push(rectPoints(nx - nodeWidth / 2, ny - nodeHeight / 2, nodeWidth, nodeHeight));
    }
    fills = (parts) => (
      <>
        <circle cx={cx} cy={cy} r={Math.min(rx, ry) * 0.42 * (parts[0].done ? 1 : 0)} fill={accent} />
        {branches.map(([nx, ny], index) => parts[2 + index * 2].done ? (
          <rect key={index} x={nx - nodeWidth / 2} y={ny - nodeHeight / 2} width={nodeWidth} height={nodeHeight} fill={accent} opacity={0.14} />
        ) : null)}
      </>
    );
  }

  const amount = progress(frame, 4, 4 + fps * duration, ease.linear);
  const drawing = sequence(strokes, amount);
  const lift = progress(frame, 4 + fps * duration, 4 + fps * duration + 10, ease.snap);
  return (
    <g>
      {fills(drawing.parts)}
      {drawing.parts.map((part, index) => (
        <path key={index} d={part.d} fill="none" stroke={role === 'end-card' && index === 1 ? accent : ink}
          strokeWidth={u * (role === 'end-card' && index === 1 ? 1.4 : 0.75 + (index % 2) * 0.12)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <Marker tip={[drawing.tip[0] + lift * u * 4, drawing.tip[1] - lift * u * 6]} u={u} accent={accent} ink={ink} opacity={1 - lift} />
    </g>
  );
};

// ---------------------------------------------------------------------------------------------
// Chalkboard Proof: colour-coded chalk with a faint halo, arriving in counted groups.

const Chalk: FC<{d: string; color: string; width: number}> = ({d, color, width}) => (
  <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} strokeWidth={width * 2.6} opacity={0.14} />
    <path d={d} strokeWidth={width} opacity={0.94} />
  </g>
);

const CHALK = {yellow: '#f6e07a', pink: '#f4a9bc', blue: '#9ad3f0', white: '#f3f1e7'};

const ChalkboardDrawing: FC<DrawingProps> = ({frame, fps, role, layout, u, direction, accent}) => {
  const {art} = layout;
  const width = u * 0.8;

  if (role === 'end-card') {
    // The conclusion is boxed, then closed with a tombstone mark.
    const box = rectPoints(art.x, art.y, art.width, art.height);
    const drawn = partial(box, progress(frame, 2, 2 + fps * 1.0, ease.smooth));
    const done = popIn(frame, 2 + fps * 1.0, 2 + fps * 1.0 + 8);
    // Tombstone in the reading-end bottom corner.
    const mark = u * 3 * done;
    const centerX = direction === 'rtl' ? art.x + u * 4 : art.x + art.width - u * 4;
    const centerY = art.y + art.height - u * 4;
    return (
      <g>
        <Chalk d={drawn.d} color={CHALK.white} width={width} />
        <rect x={centerX - mark / 2} y={centerY - mark / 2} width={mark} height={mark} fill={accent} opacity={0.94} />
      </g>
    );
  }

  const k = Math.min(art.width, art.height) * 0.86;
  const cx = art.x + art.width / 2;
  const cy = art.y + art.height / 2;

  if (role === 'explainer') {
    // 1 + 3 + 5 = 3²: three L-shaped groups of dots counted in, then the square is drawn around them.
    // Grid cell (column, row) to canvas; columns run in reading direction, rows upward.
    const step = k / 3.6;
    const colors = [accent, CHALK.pink, CHALK.blue];
    const cell = (column: number, row: number): Point => [
      direction === 'rtl' ? cx + step - column * step : cx - step + column * step,
      cy + step - row * step,
    ];
    const dots: {at: Point; group: number; order: number}[] = [];
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
      const group = Math.max(row, column);
      dots.push({at: cell(column, row), group, order: dots.filter((dot) => dot.group === group).length});
    }
    const groupStart = (group: number) => 4 + group * fps * 0.5;
    // Each group closes with the L-shaped chalk edge that makes it the next square.
    const edges = [0, 1, 2].map((group) => [cell(-0.5, group + 0.5), cell(group + 0.5, group + 0.5), cell(group + 0.5, -0.5)]);
    const closing = partial([cell(-0.5, 2.5), cell(-0.5, -0.5), cell(2.5, -0.5)], progress(frame, fps * 1.75, fps * 2.3, ease.smooth));
    return (
      <g>
        {dots.map((dot, index) => {
          const at = groupStart(dot.group) + dot.order * 4;
          const pop = popIn(frame, at, at + 8);
          return <circle key={index} cx={dot.at[0]} cy={dot.at[1]} r={step * 0.2 * pop} fill={colors[dot.group]} opacity={0.94} />;
        })}
        {edges.map((edge, group) => {
          const at = groupStart(group) + (group * 2 + 1) * 4;
          return <Chalk key={group} d={partial(edge, progress(frame, at, at + 10, ease.smooth)).d} color={colors[group]} width={width * 0.6} />;
        })}
        <Chalk d={closing.d} color={CHALK.white} width={width * 0.6} />
      </g>
    );
  }

  // Title: a right triangle, sides drawn in counted order and colour, then the right angle marked.
  const sign = direction === 'rtl' ? -1 : 1;
  const half = k / 2;
  const corner: Point = [cx - sign * half, cy + half * 0.8];
  const base: Point = [cx + sign * half, cy + half * 0.8];
  const apex: Point = [cx - sign * half, cy - half * 0.8];
  const sides = sequence([[corner, base], [base, apex], [apex, corner]], progress(frame, 4, 4 + fps * 1.2, ease.smooth));
  const mark = progress(frame, 4 + fps * 1.2, 4 + fps * 1.2 + 8);
  const size = k * 0.09;
  return (
    <g>
      {sides.parts.map((part, index) => <Chalk key={index} d={part.d} color={[accent, CHALK.blue, CHALK.pink][index]} width={width} />)}
      <g opacity={mark}>
        <Chalk d={`M${corner[0] + sign * size} ${corner[1]} V${corner[1] - size} H${corner[0]}`} color={CHALK.white} width={width * 0.6} />
      </g>
      {[0, 1, 2, 3, 4].map((index) => (
        <circle key={index} cx={art.x + art.width * (0.14 + index * 0.18)} cy={art.y + art.height * 0.97 + Math.sin(index * 2.1) * u * 0.6}
          r={u * (0.25 + (index % 2) * 0.15)} fill={CHALK.white} opacity={0.35 * progress(frame, 10 + index * 3, 20 + index * 3)} />
      ))}
    </g>
  );
};

const DRAWINGS: Record<StyleId, FC<DrawingProps>> = {
  plotter: PlotterDrawing,
  doodle: DoodleDrawing,
  whiteboard: WhiteboardDrawing,
  chalkboard: ChalkboardDrawing,
};

// ---------------------------------------------------------------------------------------------
// Typography motion, distinct per style: decisive landing, bouncy pop, marker write-on, chalk focus.

const textMotion = (styleId: StyleId, frame: number, fps: number, u: number, direction: TextDirection, delay: number): CSSProperties => {
  const at = frame - delay;
  if (styleId === 'plotter') {
    const land = progress(at, 2, 14, ease.crash);
    return {opacity: progress(at, 2, 7), transform: `translateY(${((1 - land) * u * 3).toFixed(2)}px) scale(${(1.06 - 0.06 * land).toFixed(4)})`};
  }
  if (styleId === 'doodle') {
    const pop = springAt(at, fps, 'bouncy', 2);
    return {opacity: progress(at, 2, 8), transform: `translateY(${((1 - pop) * u * 5).toFixed(2)}px)`};
  }
  if (styleId === 'whiteboard') {
    // Written on in reading direction under a feathered edge, so glyphs fade in whole rather than
    // showing a hard cut through a word; no mask once complete.
    const write = progress(at, 4, 4 + fps * 0.7, ease.smooth);
    if (write >= 1) return {};
    const edge = write * 125;
    const mask = `linear-gradient(${direction === 'rtl' ? 'to left' : 'to right'}, #000 ${(edge - 25).toFixed(2)}%, transparent ${edge.toFixed(2)}%)`;
    return {maskImage: mask, WebkitMaskImage: mask};
  }
  const focus = progress(at, 3, 3 + fps * 0.6, ease.smooth);
  return {opacity: focus, filter: focus >= 1 ? undefined : `blur(${((1 - focus) * u * 0.8).toFixed(2)}px)`};
};

export const StyleScene: FC<StyleSceneProps> = ({styleId, role, text, secondaryText = '', direction, accent}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const theme = getStyleTheme(styleId);
  const headline = typeof text === 'string' ? text : '';
  const supporting = typeof secondaryText === 'string' ? secondaryText : '';
  const headlineDirection = direction === 'rtl' || direction === 'ltr' ? direction : dominantDirection(headline, 'rtl');
  const supportingDirection = dominantDirection(supporting, headlineDirection);
  const layout = useMemo(() => styleSceneLayout(styleId, role, width, height, headlineDirection), [styleId, role, width, height, headlineDirection]);
  const u = layout.unit;
  const highlight = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : theme.accent;
  const align = layout.align === 'center' ? 'center' : headlineDirection === 'rtl' ? 'right' : 'left';
  const Drawing = DRAWINGS[styleId];
  const background = styleId === 'doodle' ? 'linear-gradient(#d3edf8, #b6dff0 60%)'
    : styleId === 'chalkboard' ? 'radial-gradient(circle at 50% 55%, #31584a, #17302a)' : theme.background;

  return (
    <AbsoluteFill data-style-template={styleId} data-style-role={role}
      style={{
        background, color: theme.foreground, overflow: 'hidden',
        // An inset frame, not a border: a border would shift every child off the safe-area grid.
        boxShadow: styleId === 'chalkboard' ? `inset 0 0 0 ${Math.max(6, u * 1.3).toFixed(1)}px #6c4d31` : undefined,
      }}>
      {styleId === 'plotter' ? (
        <AbsoluteFill aria-hidden style={{
          backgroundImage: 'linear-gradient(#27303a 1px,transparent 1px),linear-gradient(90deg,#27303a 1px,transparent 1px)',
          backgroundSize: `${Math.round(u * 3.6)}px ${Math.round(u * 3.6)}px`, opacity: 0.6,
        }} />
      ) : null}
      {styleId === 'chalkboard' ? <AbsoluteFill aria-hidden style={{
        backgroundImage: 'repeating-radial-gradient(circle at 30% 20%, #fff 0 1px, transparent 1px 11px)', opacity: 0.08,
      }} /> : null}
      <svg aria-hidden viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <Drawing frame={frame} fps={fps} role={role} layout={layout} width={width} height={height} u={u}
          direction={headlineDirection} accent={highlight} theme={theme} />
      </svg>
      <div style={{
        position: 'absolute', left: layout.text.x, top: layout.text.y, width: layout.text.width, height: layout.text.height,
        display: 'flex', flexDirection: 'column', gap: layout.gap,
        justifyContent: layout.verticalAlign === 'center' ? 'center' : 'flex-start',
      }}>
        <div style={textMotion(styleId, frame, fps, u, headlineDirection, 0)}>
          <FittedText text={headline} direction={headlineDirection} level={layout.headline.level} role="display"
            box={{width: layout.text.width, height: layout.headline.boxHeight}} fitHeight
            minSize={layout.headline.minSize} maxSize={layout.headline.maxSize} maxLines={layout.headline.maxLines}
            align={align} verticalAlign="start" />
        </div>
        {supporting ? (
          <div style={textMotion(styleId, frame, fps, u, supportingDirection, Math.round(fps * 0.3))}>
            <FittedText text={supporting} direction={supportingDirection} level="body" role="text"
              box={{width: layout.text.width, height: layout.supporting.boxHeight}} fitHeight
              minSize={layout.supporting.minSize} maxSize={layout.supporting.maxSize} maxLines={layout.supporting.maxLines}
              color={theme.supporting} align={align} verticalAlign="start" />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
