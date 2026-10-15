import {Easing, spring} from 'remotion';
import {bump, decay, ease, mix, progress, track} from '../../motion/core';
import type {Ease, Key} from '../../motion/core';

// Every value in this file is a pure function of the global frame so Studio scrubbing,
// diagnostic stills, and the owner's eventual export all see identical motion.
// The generic helpers now live in src/motion/core and are re-exported unchanged.

export type {Ease, Key};
export {bump, decay, mix, progress, track};

export const smooth: Ease = ease.smooth;
export const snap: Ease = ease.snap;
export const overshoot: Ease = ease.overshoot;
export const rise: Ease = ease.rise;
export const fall: Ease = ease.fall;
const crash: Ease = ease.crash;

const fps = 30;

/* ------------------------------------------------------------------ world layout */

export const GROUND = 1580;
export const CHARACTER_SCALE = 1.25;
export const TABLE = {left: 515, right: 1040, top: 1390} as const;
export const NOTEBOOK = {x: 560, y: 1170, width: 300, height: 220} as const;
export const BOX = {left: 815, right: 1015, top: 1430, mouthX: 915, mouthY: 1440} as const;
export const POT = {x: 950, y: TABLE.top} as const;
const HEAD = {x: 360, y: 1090} as const;

/* ------------------------------------------------------------------ camera */

export type Camera = {x: number; y: number; zoom: number; rotate: number};

const cameraKeys: readonly (readonly [number, number, number, number, number, Ease?])[] = [
  // frame, x, y, zoom, rotate, easing into this key
  [0, 902, 1240, 2.4, -4],
  [28, 895, 1235, 2.55, -2],
  [42, 560, 1080, 1, 0, crash], // hook → crash out to reveal the startled character
  [70, 540, 1080, 1.04, 0],
  [84, 440, 1050, 1.1, -1.5, snap], // whip toward the appointment
  [112, 450, 1050, 1.1, -1],
  [120, 640, 1060, 1.12, 1.5, snap], // whip toward the message
  [146, 620, 1060, 1.12, 1],
  [152, 460, 1080, 1.14, -1, snap], // whip back to the task
  [222, 500, 1080, 1.1, 0],
  [240, 480, 1090, 1.14, 2],
  [300, 560, 1060, 1.16, -2],
  [340, 520, 1080, 1.2, -3],
  [440, 430, 1110, 1.36, 4, Easing.in(Easing.quad)], // pressure: dutch push-in
  [450, 430, 1110, 1.36, 4],
  [458, 560, 1080, 1, 0, snap], // freeze: everything snaps level
  [500, 560, 1100, 1.06, 0],
  [512, 540, 1110, 1.07, -1],
  [540, 700, 1170, 1.05, 1.5, snap], // follow the sweep into the box
  [560, 680, 1150, 1.04, 0],
  [600, 580, 1100, 1, 0],
  [662, 690, 1260, 1.5, -1], // push in on the one chosen task
  [676, 695, 1265, 1.55, -1],
  [760, 700, 1255, 1.55, 0.5],
  [800, 640, 1110, 1, 0], // pull back: the room has calmed down
  [838, 620, 1100, 0.98, 0],
  [844, 620, 1100, 1.04, 0, snap], // landing punch
  [874, 580, 1080, 0.97, 0],
  [899, 580, 1080, 0.97, 0],
];

const cameraTrack = (field: 1 | 2 | 3 | 4, f: number) =>
  track(
    f,
    cameraKeys.map((key) => [key[0], key[field], key[5]] as const),
  );

export const pressureAt = (f: number) => (f >= 450 ? 1 : progress(f, 340, 440, Easing.in(Easing.quad)));

export const cameraAt = (f: number): Camera => {
  const pressure = f < 456 ? pressureAt(f) : 0;
  const impact = decay(f, 550, 16, 2.3) * 9 + decay(f, 840, 14, 2.1) * 7 + decay(f, 30, 14, 2.6) * 10;
  return {
    x: cameraTrack(1, f) + Math.sin(f * 1.31) * 8 * pressure + impact,
    y: cameraTrack(2, f) + Math.sin(f * 0.93) * 5 * pressure - impact * 0.5,
    zoom: cameraTrack(3, f),
    rotate: cameraTrack(4, f) + Math.sin(f * 1.07) * 0.7 * pressure,
  };
};

/* ------------------------------------------------------------------ character rig */

export type Mood = 'calm' | 'startled' | 'worried' | 'overwhelmed' | 'deciding' | 'focused' | 'proud';

export type Pose = {
  lean: number;
  head: number;
  lookX: number;
  lookY: number;
  facing: number;
  lSh: number;
  lEl: number;
  rSh: number;
  rEl: number;
  lHip: number;
  lKnee: number;
  lFoot: number;
  rHip: number;
  rKnee: number;
  rFoot: number;
  lift: number;
  squash: number;
  gasp: number;
};

// Angles are degrees. Shoulder/hip: positive swings the limb outward from the body.
// Elbow: positive continues outward/up, negative folds the forearm across the body.
// Knee: positive bends the shin back toward the centre line.
const pose = (overrides: Partial<Pose>): Pose => ({
  lean: 0,
  head: 0,
  lookX: 0,
  lookY: 0,
  facing: 0,
  lSh: 14,
  lEl: 8,
  rSh: 14,
  rEl: 8,
  lHip: 4,
  lKnee: 0,
  lFoot: 0,
  rHip: 4,
  rKnee: 0,
  rFoot: 0,
  lift: 0,
  squash: 0,
  gasp: 0,
  ...overrides,
});

const P = {
  write: pose({lean: 4, head: 6, lookX: 7, lookY: 5, facing: 0.3, lSh: 12, lEl: -10, rSh: 74, rEl: -26}),
  startleAir: pose({lean: -4, head: -6, lookY: -3, lSh: 155, lEl: 25, rSh: 150, rEl: 30, lHip: 22, lKnee: 48, lFoot: 18, rHip: 16, rKnee: 36, rFoot: -8, lift: 78, squash: -0.06, gasp: 1}),
  land: pose({lean: 2, lSh: 62, lEl: 34, rSh: 56, rEl: 26, lHip: 20, lKnee: 46, rHip: 20, rKnee: 46, squash: 0.12, gasp: 0.6}),
  reachPhone: pose({lean: 8, head: 8, lookX: 10, lookY: 2, facing: 0.6, lSh: 22, lEl: 12, rSh: 86, rEl: -4, lHip: 3, rHip: 12, rKnee: 8}),
  whipLeft: pose({lean: -6, head: -11, lookX: -10, lookY: -5, facing: -0.7, lSh: 44, lEl: 42, rSh: 24, rEl: 18, lHip: 9, rHip: 2, rFoot: -8}),
  whipRight: pose({lean: 7, head: 10, lookX: 10, lookY: -4, facing: 0.7, lSh: 20, lEl: 20, rSh: 58, rEl: 52, lHip: 2, rHip: 9, lFoot: -8}),
  whipDown: pose({lean: -5, head: -8, lookX: -9, lookY: 6, facing: -0.6, lSh: 34, lEl: 30, rSh: 30, rEl: -20, lHip: 7}),
  confused: pose({head: -6, lookY: -6, lSh: 128, lEl: 72, rSh: 124, rEl: 76, lHip: 6, rHip: 6, lKnee: 8, rKnee: 8}),
  nervous: pose({lean: -2, head: 5, lookX: -4, lookY: 3, facing: -0.2, lSh: 18, lEl: -76, rSh: 18, rEl: -78, lHip: 5, rHip: 9}),
  reachUp: pose({lean: -5, head: -10, lookX: -8, lookY: 2, facing: -0.5, lSh: 150, lEl: -4, rSh: 26, rEl: -22, lHip: 10, rHip: 3, rFoot: -10}),
  bonked: pose({lean: 10, head: 18, lookX: 9, lookY: 0, facing: 0.6, lSh: 72, lEl: 30, rSh: 42, rEl: 64, lHip: 15, lKnee: 12, rHip: 3, lFoot: 14, gasp: 0.8}),
  forget: pose({lean: -3, head: -6, lookX: -9, lookY: -6, facing: -0.5, lSh: 30, lEl: -20, rSh: 96, rEl: 40, rHip: 8}),
  panic: pose({lean: -6, head: 6, lookY: 4, lSh: 150, lEl: 115, rSh: 150, rEl: 115, lHip: 20, lKnee: 48, rHip: 20, rKnee: 48, gasp: 0.5}),
  breathe: pose({lookY: -3, lSh: 24, lEl: 10, rSh: 24, rEl: 10}),
  windup: pose({lean: -11, head: -4, lookX: 6, lookY: -3, facing: 0.4, lSh: 42, lEl: 32, rSh: -38, rEl: -42, lHip: 16, lKnee: 32, rHip: 6, rKnee: 4, rFoot: -12}),
  sweepEnd: pose({lean: 12, head: 6, lookX: 10, facing: 0.7, lSh: 46, lEl: 22, rSh: 116, rEl: 12, lHip: 6, lFoot: -16, rHip: 28, rKnee: 30}),
  settle: pose({lean: 3, head: 3, lookX: 8, lookY: 2, facing: 0.5, lSh: 22, lEl: -42, rSh: 24, rEl: -46}),
  walk: pose({lean: 4, head: 2, lookX: 9, lookY: 3, facing: 0.6, lSh: 18, lEl: 6, rSh: 26, rEl: -6}),
  reachPencil: pose({lean: 7, head: 8, lookX: 9, lookY: 6, facing: 0.6, lSh: 12, lEl: -8, rSh: 66, rEl: -34}),
  lookUp: pose({head: -5, lookX: 7, lookY: -8, facing: 0.5, lSh: 22, lEl: 10, rSh: 40, rEl: -12}),
  crouch: pose({lean: 4, head: 3, lSh: 36, lEl: 42, rSh: 36, rEl: 42, lHip: 22, lKnee: 56, rHip: 22, rKnee: 56, squash: 0.06}),
  jumpAir: pose({lean: -2, head: -6, lookY: -5, lSh: 166, lEl: 6, rSh: 166, rEl: 6, lHip: 16, lKnee: 62, lFoot: 22, rHip: 14, rKnee: 58, rFoot: -6, lift: 112, squash: -0.07, gasp: 0.4}),
  land2: pose({lSh: 150, lEl: 12, rSh: 150, rEl: 12, lHip: 20, lKnee: 48, rHip: 20, rKnee: 48, squash: 0.1}),
  proud: pose({head: 4, lookY: -2, lSh: 34, lEl: -112, rSh: 152, rEl: 24, lHip: 7, rHip: 6}),
};

const poseKeys: readonly (readonly [number, Pose, Ease?])[] = [
  [0, P.write],
  [26, P.write],
  [36, P.startleAir, rise],
  [50, P.land, fall],
  [60, P.reachPhone, overshoot],
  [63, P.reachPhone],
  [72, P.whipLeft, overshoot], // معاد pops at 64
  [100, P.whipLeft],
  [108, P.whipRight, overshoot], // رسالة pops at 100
  [132, P.whipRight],
  [142, P.whipDown, overshoot], // مهمة pops at 134
  [160, P.confused],
  [186, P.nervous],
  [224, P.nervous],
  [238, P.reachUp, overshoot], // فتبدأ دي
  [276, P.reachUp],
  [287, P.bonked, snap], // وتسيب دي — the call hits his head
  [300, P.bonked],
  [318, P.forget], // وتنسى دي
  [340, P.forget],
  [374, P.panic],
  [452, P.panic],
  [490, P.breathe, Easing.inOut(Easing.sin)],
  [500, P.breathe],
  [516, P.windup],
  [532, P.sweepEnd, snap],
  [548, P.sweepEnd],
  [566, P.settle, overshoot],
  [592, P.settle],
  [606, P.walk],
  [634, P.walk],
  [652, P.reachPencil],
  [670, P.write],
  [768, P.write],
  [782, P.lookUp],
  [800, P.lookUp],
  [812, P.crouch],
  [826, P.jumpAir, rise],
  [840, P.land2, fall],
  [862, P.proud, overshoot],
  [899, P.proud],
];

const blendPose = (f: number): Pose => {
  if (f <= poseKeys[0][0]) return {...poseKeys[0][1]};
  for (let index = 1; index < poseKeys.length; index += 1) {
    const [to, target, ease = smooth] = poseKeys[index];
    if (f <= to) {
      const [from, start] = poseKeys[index - 1];
      const t = ease(to === from ? 1 : (f - from) / (to - from));
      const out = {...target};
      for (const field of Object.keys(target) as (keyof Pose)[]) out[field] = mix(start[field], target[field], t);
      return out;
    }
  }
  return {...poseKeys[poseKeys.length - 1][1]};
};

const moodKeys: readonly (readonly [number, Mood])[] = [
  [0, 'calm'],
  [28, 'startled'],
  [58, 'worried'],
  [160, 'overwhelmed'],
  [236, 'worried'],
  [284, 'overwhelmed'],
  [462, 'calm'],
  [504, 'deciding'],
  [566, 'focused'],
  [776, 'proud'],
];

const xKeys: readonly Key[] = [
  [0, 360],
  [345, 360],
  [395, 320], // backs away from the pile-up
  [478, 320],
  [500, 345], // steps back into place after the breath
  [512, 345],
  [532, 385, snap], // lunge with the sweep
  [592, 385],
  [634, 450], // walks to the chosen notebook
  [899, 450],
];

export const characterXAt = (f: number) => track(f, xKeys);

const blinkFrames = [52, 128, 196, 262, 372, 560, 655, 740, 868];

export type CharacterState = {
  x: number;
  pose: Pose;
  mood: Mood;
  blink: number;
  breath: number;
  pencilInHand: boolean;
};

export const characterAt = (f: number): CharacterState => {
  const p = blendPose(f);
  const x = characterXAt(f);

  // Writing scribble in the right forearm.
  const writing = f < 30 || (f >= 670 && f < 768) ? 1 : 0;
  p.rEl += Math.sin(f * 1.1) * 7 * writing;
  p.rSh += Math.sin(f * 0.55) * 4 * writing;

  // Nervous toe tap on one foot while the other carries weight.
  const tap = progress(f, 160, 172) * (1 - progress(f, 216, 226));
  p.rFoot += Math.max(0, Math.sin(f * 0.62)) * 24 * tap;
  p.lKnee += (Math.sin(f * 0.31) * 0.5 + 0.5) * 6 * tap;

  // Knee-knocking tremble under pressure.
  const pressure = f < 456 ? pressureAt(f) : 0;
  p.lKnee += Math.sin(f * 1.7) * 7 * pressure;
  p.rKnee += Math.sin(f * 1.7 + Math.PI) * 7 * pressure;
  p.head += Math.sin(f * 1.2) * 3 * pressure;

  // Dusting the hands after closing the box.
  const dust = progress(f, 564, 570) * (1 - progress(f, 586, 594));
  p.lEl += Math.sin(f * 1.4) * 16 * dust;
  p.rEl += Math.sin(f * 1.4 + Math.PI) * 16 * dust;

  // Locomotion: legs alternate from the distance travelled, so steps match the x track.
  const speed = Math.abs(x - characterXAt(f - 1));
  const stepping = Math.min(1, speed / 1.5);
  const phase = (x / 34) * Math.PI;
  const leftLift = Math.max(0, Math.sin(phase)) * stepping;
  const rightLift = Math.max(0, -Math.sin(phase)) * stepping;
  p.lHip += 6 * leftLift;
  p.lKnee += 52 * leftLift;
  p.lFoot -= 14 * leftLift;
  p.rHip += 6 * rightLift;
  p.rKnee += 52 * rightLift;
  p.rFoot -= 14 * rightLift;
  p.lean += Math.sin(phase) * 2 * stepping;

  const closedEyes = progress(f, 462, 468) * (1 - progress(f, 490, 496));
  const blink = Math.max(closedEyes, ...blinkFrames.map((at) => Math.max(0, 1 - Math.abs(f - at) / 3)));
  const breath = Math.sin(f / 15) * 0.012 + bump(f, 462, 500) * 0.06;
  const mood = [...moodKeys].reverse().find(([at]) => f >= at)?.[1] ?? 'calm';

  return {x, pose: p, mood, blink, breath, pencilInHand: f < 30 || (f >= 642 && f < 806)};
};

/* ------------------------------------------------------------------ distractions */

export type BubbleSpec = {
  label: string;
  icon: string;
  color: string;
  appear: number;
  home: readonly [number, number];
  from?: readonly [number, number];
  rotate: number;
};

export const bubbleSpecs: readonly BubbleSpec[] = [
  {label: 'معاد', icon: '⏰', color: '#FFE58F', appear: 64, home: [200, 760], rotate: -8},
  {label: 'رسالة', icon: '💬', color: '#F6A5B8', appear: 100, home: [820, 800], rotate: 7},
  {label: 'مهمة', icon: '✓', color: '#CFEAF7', appear: 134, home: [160, 1000], rotate: -5},
  {label: 'إيميل', icon: '✉', color: '#C6E8FF', appear: 232, from: [-260, 640], home: [150, 640], rotate: 6},
  {label: 'مكالمة', icon: '☎', color: '#E4C4F4', appear: 262, from: [1320, 860], home: [800, 1000], rotate: -4},
  {label: 'بوست', icon: '♡', color: '#FFD0D0', appear: 300, from: [560, -260], home: [560, 600], rotate: 5},
  {label: 'فكرة', icon: '⚑', color: '#FFD2A8', appear: 318, from: [1340, 560], home: [860, 640], rotate: 8},
  {label: 'تعديل', icon: '↻', color: '#BCDB92', appear: 340, from: [1300, 1500], home: [900, 1150], rotate: -7},
];

export type BubbleState = {x: number; y: number; scale: number; rotate: number; opacity: number; gray: number};

const quadratic = (a: number, control: number, b: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * control + t * t * b;

const bubbleRestAt = (index: number, f: number) => {
  const spec = bubbleSpecs[index];
  const frozen = Math.min(f, 450); // time literally stops for the distractions at the decision
  const entry = spec.from ? progress(frozen, spec.appear, spec.appear + 16, snap) : 1;
  let x = spec.from ? mix(spec.from[0], spec.home[0], entry) : spec.home[0];
  let y = spec.from ? mix(spec.from[1], spec.home[1], entry) : spec.home[1];

  if (index === 2) {
    // The task he starts: drawn to his hand, held, then abandoned and drifting away.
    const pull = progress(frozen, 236, 252, snap);
    const leave = progress(frozen, 296, 330);
    x = mix(mix(x, 196, pull), 110, leave);
    y = mix(mix(y, 1118, pull), 880, leave);
  }
  if (index === 4) {
    // The call that hits him: in fast, contact at 284, rebound to its orbit.
    const hit = progress(frozen, 262, 284, fall);
    const rebound = progress(frozen, 284, 312, overshoot);
    x = mix(mix(1320, 468, hit), spec.home[0], rebound);
    y = mix(mix(860, 1060, hit), spec.home[1], rebound);
  }

  const pressure = pressureAt(frozen);
  x = mix(x, HEAD.x, 0.18 * pressure) + Math.cos(frozen / (7 + index * 0.5) + index) * (3 + pressure * 8);
  y = mix(y, HEAD.y, 0.18 * pressure) + Math.sin(frozen / (6 + index * 0.4) + index) * (5 + pressure * 10);
  return {x, y, pressure, frozen};
};

export const bubbleAt = (index: number, f: number): BubbleState => {
  const spec = bubbleSpecs[index];
  const rest = bubbleRestAt(index, f);
  const appear = spring({frame: rest.frozen - spec.appear, fps, config: {damping: 11, stiffness: 170}});
  const contact = index === 2 ? decay(f, 252, 18, 1.4) * 0.12 : index === 4 ? decay(f, 284, 16, 1.6) * 0.2 : 0;
  let scale = appear * (1 + rest.pressure * 0.06) + contact;
  let rotate = spec.rotate + Math.sin(rest.frozen / 7 + index) * (2 + 5 * rest.pressure);
  let opacity = 1;
  let gray = progress(f, 452, 462) * 0.45;

  if (index === 2) {
    const forgotten = progress(f, 322, 350);
    opacity = 1 - forgotten * 0.72;
    gray = Math.max(gray, forgotten);
    scale *= 1 - forgotten * 0.2;
  }

  const start = 514 + index * 2.5;
  const swept = progress(f, start, start + 26, smooth);
  if (swept > 0) {
    const anchor = bubbleRestAt(index, 450);
    const controlX = (anchor.x + BOX.mouthX) / 2 + 120;
    const controlY = Math.min(anchor.y, BOX.mouthY) - 260;
    return {
      x: quadratic(anchor.x, controlX, BOX.mouthX, swept),
      y: quadratic(anchor.y, controlY, BOX.mouthY, swept),
      scale: scale * (1 - 0.75 * swept),
      rotate: rotate + swept * 260,
      opacity: opacity * (1 - progress(swept, 0.82, 1, Easing.linear)),
      gray: gray * (1 - swept),
    };
  }

  return {x: rest.x, y: rest.y, scale, rotate, opacity, gray};
};

/* ------------------------------------------------------------------ props */

export const phoneAt = (f: number) => {
  const buzzing = f >= 4 && f < 450 ? 1 : 0;
  const hop = progress(f, 518, 546, Easing.inOut(Easing.quad));
  const restX = 902 - progress(f, 8, 70) * 110 - progress(f, 230, 330) * 30;
  const restY = 1245;
  return {
    visible: f < 546,
    buzzing,
    x: quadratic(restX, 900, BOX.mouthX, hop),
    y: quadratic(restY, 1030, BOX.mouthY, hop),
    rotate: -6 + Math.sin(f * 1.85) * 6 * buzzing + hop * 220,
    scale: 1 - hop * 0.55,
  };
};

export const boxAt = (f: number) => ({
  visible: f >= 484,
  drop: track(f, [
    [484, -1150],
    [502, 0, fall],
  ]),
  squash: bump(f, 502, 516) * 0.18 + bump(f, 550, 564) * 0.14,
  lid: track(f, [
    [484, 118],
    [546, 118],
    [552, 0, fall],
  ]),
});

export const notebookAt = (f: number) => ({
  lines: Math.max(0.25 + progress(f, 0, 26) * 0.1, progress(f, 678, 728)),
  check: progress(f, 728, 762, snap),
  glow: progress(f, 636, 676) * (1 - progress(f, 800, 840) * 0.4),
  pop: decay(f, 762, 18, 1.2) * 0.06,
});

export const plantAt = (f: number) => ({
  pot: spring({frame: f - 756, fps, config: {damping: 12, stiffness: 160}}) + bump(f, 790, 800) * 0.08 + bump(f, 799, 809) * 0.08 + bump(f, 808, 818) * 0.08,
  stem: progress(f, 792, 842, snap),
  leaves: progress(f, 812, 850, overshoot),
  bloom: spring({frame: f - 842, fps, config: {damping: 10, stiffness: 140}}),
  sway: Math.sin(f / 9) * 3 * (1 - progress(f, 850, 885)),
});

export const checkFlightAt = (index: number, f: number) => {
  const t = progress(f, 764 + index * 9, 790 + index * 9, smooth);
  return {
    visible: t > 0 && t < 1,
    x: quadratic(720, 840, POT.x, t),
    y: quadratic(1250, 1050 - index * 60, POT.y - 70, t),
    scale: 0.6 + bump(t, 0, 1) * 0.5,
  };
};

export const vignetteAt = (f: number) =>
  Math.max(
    (f < 456 ? pressureAt(f) : 0) * 0.32,
    track(f, [
      [590, 0],
      [650, 0.5],
      [760, 0.5],
      [800, 0],
    ]),
  );
