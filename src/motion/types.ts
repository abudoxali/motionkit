import type {ComponentType} from 'react';
import type {FontRole} from './typography/fonts';

export type TextDirection = 'rtl' | 'ltr';

export type PresetProps = {
  text: string;
  secondaryText?: string;
  accent: string;
  direction: TextDirection;
  /** Bundled font role; defaults to the display face. */
  typeface?: FontRole;
};

export type PresetCategory =
  | 'Typography'
  | 'Brand'
  | 'Drawing'
  | 'Camera'
  | 'Data'
  | 'Transitions'
  | 'Social';

export type MotionPreset = {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  configurable: Array<keyof PresetProps>;
  durationInFrames: number;
  component: ComponentType<PresetProps>;
  defaultProps: PresetProps;
  usage: string;
};

export type StyleDefinition = {
  id: 'plotter' | 'doodle' | 'whiteboard' | 'chalkboard';
  name: string;
  category: string;
  description: string;
  identity: string[];
  colors: string[];
  recommendedFor: string;
  attribution: string;
  referencePolicy: 'code-preview-only';
  previewComponent: ComponentType;
};
