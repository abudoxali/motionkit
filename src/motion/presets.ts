import {
  CameraParallax,
  CountUpStat,
  HandDrawnRoute,
  IconBurst,
  KineticStack,
  LogoPrismReveal,
  LowerThirdBeam,
  MarkerHighlight,
  ShapeMorphTransition,
  SocialPromoPulse,
  TitleOrbit,
  WhiteboardExplainer,
  WordCascadeSubtitles,
} from './components/MotionPresets';
import type {MotionPreset, PresetProps} from './types';

const base: PresetProps = {
  text: 'Motion with intent',
  secondaryText: 'A reusable, deterministic Remotion preset',
  accent: '#4f7cff',
  direction: 'ltr',
};

export const motionPresets: MotionPreset[] = [
  {id: 'kinetic-stack', name: 'Kinetic Stack', category: 'Typography', description: 'Weighted words land in a rhythmic editorial stack.', configurable: ['text', 'accent', 'direction', 'typeface'], durationInFrames: 120, component: KineticStack, defaultProps: {...base, text: 'Build motion that speaks'}, usage: '<KineticStack text="Build motion that speaks" accent="#4f7cff" direction="ltr" />'},
  {id: 'title-orbit', name: 'Title Orbit', category: 'Typography', description: 'A restrained orbital title system for chapter openings.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 150, component: TitleOrbit, defaultProps: {...base, text: 'Ideas in orbit'}, usage: '<TitleOrbit {...props} />'},
  {id: 'lower-third-beam', name: 'Lower Third Beam', category: 'Typography', description: 'Broadcast lower third with a directional light pass.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 120, component: LowerThirdBeam, defaultProps: {...base, text: 'Abdullah Ragab', secondaryText: 'Creative technologist'}, usage: '<LowerThirdBeam {...props} />'},
  {id: 'logo-prism-reveal', name: 'Prism Reveal', category: 'Brand', description: 'Geometric linework resolves into a centered brand mark.', configurable: ['text', 'accent', 'typeface'], durationInFrames: 120, component: LogoPrismReveal, defaultProps: {...base, text: 'ABUD'}, usage: '<LogoPrismReveal {...props} />'},
  {id: 'marker-highlight', name: 'Marker Highlight', category: 'Typography', description: 'An RTL-safe hand marker sweep behind a complete phrase.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 120, component: MarkerHighlight, defaultProps: {...base, text: 'الفكرة تتحرك أمامك', secondaryText: 'لا تقسيم للحروف العربية', accent: '#f6c84b', direction: 'rtl'}, usage: '<MarkerHighlight direction="rtl" text="الفكرة تتحرك أمامك" {...props} />'},
  {id: 'word-cascade', name: 'Word Cascade', category: 'Typography', description: 'Word-by-word captions with a single active emphasis.', configurable: ['text', 'accent', 'direction', 'typeface'], durationInFrames: 150, component: WordCascadeSubtitles, defaultProps: {...base, text: 'كل كلمة تظهر في توقيتها من غير ما نكسر العربية', accent: '#ff8a3d', direction: 'rtl'}, usage: '<WordCascadeSubtitles {...props} />'},
  {id: 'hand-drawn-route', name: 'Hand-drawn Route', category: 'Drawing', description: 'A plotted path draws between three narrative waypoints.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 120, component: HandDrawnRoute, defaultProps: {...base, text: 'From script to screen', secondaryText: 'Three beats. One visual route.', accent: '#d45f3f'}, usage: '<HandDrawnRoute {...props} />'},
  {id: 'whiteboard-explainer', name: 'Whiteboard Explainer', category: 'Drawing', description: 'Marker lines construct a simple explanatory diagram.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 120, component: WhiteboardExplainer, defaultProps: {...base, text: 'Explain one idea clearly', secondaryText: 'Draw, connect, then hold for reading.', accent: '#2368d8'}, usage: '<WhiteboardExplainer {...props} />'},
  {id: 'camera-parallax', name: 'Camera Parallax', category: 'Camera', description: 'Layered planes create a calm camera push without footage.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 150, component: CameraParallax, defaultProps: {...base, text: 'Depth without distraction'}, usage: '<CameraParallax {...props} />'},
  {id: 'count-up-stat', name: 'Count-up Stat', category: 'Data', description: 'A precise radial counter for milestones and data reveals.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 120, component: CountUpStat, defaultProps: {...base, text: 'Frame accurate', secondaryText: 'Deterministic at every frame'}, usage: '<CountUpStat {...props} />'},
  {id: 'shape-morph', name: 'Shape Morph', category: 'Transitions', description: 'Nested geometry wipes a scene through a controlled color inversion.', configurable: ['text', 'accent', 'typeface'], durationInFrames: 90, component: ShapeMorphTransition, defaultProps: {...base, text: 'Next scene'}, usage: '<ShapeMorphTransition {...props} />'},
  {id: 'social-promo', name: 'Social Promo Pulse', category: 'Social', description: 'A bold promotional end card that adapts to any aspect ratio.', configurable: ['text', 'secondaryText', 'accent', 'direction', 'typeface'], durationInFrames: 150, component: SocialPromoPulse, defaultProps: {...base, text: 'Make the story impossible to skip', secondaryText: 'Designed for reels, shorts, square posts, and widescreen.'}, usage: '<SocialPromoPulse {...props} />'},
];


// A small extra building block is exported for project compositions without inflating the catalog count.
export {IconBurst};

export const getPreset = (id: string) => {
  const preset = motionPresets.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown motion preset: ${id}`);
  return preset;
};
