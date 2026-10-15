import {createElement} from 'react';
import type {ComponentType, FC} from 'react';
import type {PresetProps} from './types';
import {detectDirection} from './typography/script';

// Preset props arrive from the library UI, Studio's props editor, and project code. Every exported
// preset component is wrapped (components/MotionPresets.tsx), so malformed values degrade
// predictably instead of crashing a render.

const COLOR_SHAPE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i;

/** Uses the browser's own parser when available, so made-up colour names are rejected. */
const isColor = (value: string) =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS.supports('color', value) : COLOR_SHAPE.test(value);

export const sanitizePresetProps = (props: Partial<Record<keyof PresetProps, unknown>>, fallbackAccent = '#4f7cff'): PresetProps => {
  const text = typeof props.text === 'string' ? props.text : '';
  const secondaryText = typeof props.secondaryText === 'string' ? props.secondaryText : undefined;
  const accent = typeof props.accent === 'string' && isColor(props.accent.trim()) ? props.accent.trim() : fallbackAccent;
  // An unknown direction follows the copy, as the library's "Auto" option does.
  const direction = props.direction === 'rtl' || props.direction === 'ltr' ? props.direction : detectDirection(text);
  // Unknown typefaces fall back to the display face rather than throwing in the font lookup.
  const typeface = props.typeface === 'text' ? 'text' : 'display';
  return {text, secondaryText, accent, direction, typeface};
};

export const withSanitizedProps = (Component: ComponentType<PresetProps>, fallbackAccent?: string): FC<PresetProps> => {
  const Sanitized: FC<PresetProps> = (props) => createElement(Component, sanitizePresetProps(props, fallbackAccent));
  Sanitized.displayName = Component.displayName ?? Component.name;
  return Sanitized;
};
