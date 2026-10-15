import {
  ChalkboardStylePreview,
  DoodleStylePreview,
  PlotterStylePreview,
  WhiteboardStylePreview,
} from './StylePreviews';
import type {StyleDefinition} from '../types';

export const styleDefinitions: StyleDefinition[] = [
  {
    id: 'plotter',
    name: 'Plotter Signal',
    category: 'Technical explainer',
    description: 'A bright plotting line, restrained glow, and editorial typography over a dark measured grid.',
    identity: ['Three-color discipline', 'Path drawing timed to narration', 'Large kinetic words'],
    colors: ['#101317', '#f0ede6', '#ff7a2f'],
    recommendedFor: 'Technical explainers, product systems, abstract concepts',
    attribution: 'Adapted from the upstream plotter direction, which credits mexicat/pdoom-video (MIT). Preview artwork is original code.',
    referencePolicy: 'code-preview-only',
    previewComponent: PlotterStylePreview,
  },
  {
    id: 'doodle',
    name: 'Doodle Journey',
    category: 'Narrative illustration',
    description: 'Hand-inked characters travel through one connected illustrated world while captions follow the voice.',
    identity: ['Cut-out character motion', 'One-take camera travel', 'Warm ink and landscape palette'],
    colors: ['#afdceF', '#f1d9ae', '#3a2a1e', '#f07f2e'],
    recommendedFor: 'Stories, educational reels, human-centered narration',
    attribution: 'Direction retained from the Motalim Motion Starter Kit. Preview character and scene are newly drawn in code.',
    referencePolicy: 'code-preview-only',
    previewComponent: DoodleStylePreview,
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard Logic',
    category: 'Step-by-step lesson',
    description: 'Marker strokes build a diagram in front of the viewer, then hold long enough to understand it.',
    identity: ['Variable marker strokes', 'Camera follows the drawing', 'Persistent explanatory diagram'],
    colors: ['#f7f7f3', '#23272e', '#1e63d6', '#e0412e'],
    recommendedFor: 'Teaching, processes, diagrams, product walkthroughs',
    attribution: 'Direction retained from the Motalim Motion Starter Kit. Preview diagram is original code.',
    referencePolicy: 'code-preview-only',
    previewComponent: WhiteboardStylePreview,
  },
  {
    id: 'chalkboard',
    name: 'Chalkboard Proof',
    category: 'Visual proof',
    description: 'Textured chalk lines construct a visual proof on a deep green board with measured camera movement.',
    identity: ['Chalk dust texture', 'Color-coded proof steps', 'Counted visual transformation'],
    colors: ['#17302a', '#f3f1e7', '#f6e07a', '#f4a9bc', '#9ad3f0'],
    recommendedFor: 'Mathematics, science, visual evidence, structured lessons',
    attribution: 'Direction retained from the Motalim Motion Starter Kit. Preview proof is original code.',
    referencePolicy: 'code-preview-only',
    previewComponent: ChalkboardStylePreview,
  },
];

export const getStyleDefinition = (id: string) => {
  const style = styleDefinitions.find((item) => item.id === id);
  if (!style) throw new Error(`Unknown style: ${id}`);
  return style;
};
