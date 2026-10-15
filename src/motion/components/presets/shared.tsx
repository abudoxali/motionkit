import type {CSSProperties, FC, ReactNode} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {canvasMetrics} from '../../core/layout';
import type {PresetProps} from '../../types';
import {FittedText, fontStack, useProjectFontsReady} from '../../typography';

// Shared pieces for the preset catalog. Presets keep their own motion and artwork; all copy goes
// through fitted text, sized from the canvas so every preset works in 16:9, 9:16, and 1:1.

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const Canvas: FC<{
  children: ReactNode;
  background?: string;
  color?: string;
  style?: CSSProperties;
  typeface?: PresetProps['typeface'];
}> = ({children, background = '#10131a', color = '#f7f5ef', style, typeface = 'display'}) => {
  useProjectFontsReady();
  return (
    <AbsoluteFill
      style={{
        background,
        color,
        // Bundled project fonts only; see src/motion/typography/fonts.ts.
        fontFamily: fontStack(typeface),
        overflow: 'hidden',
        // AbsoluteFill is 100% × 100%; without border-box, percentage padding made padded presets
        // taller than the frame in Studio and renders (the library's global CSS hid it).
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * Padding that is at least the authored fraction of the width on every side and never smaller
 * than the title-safe inset, so padded presets keep copy out of platform UI in 9:16 and 1:1.
 */
export const useSafePadding = (fraction: number) => {
  const {width, height} = useVideoConfig();
  const {safe} = canvasMetrics(width, height);
  const base = width * fraction;
  const top = Math.max(base, safe.top);
  const right = Math.max(base, safe.right);
  const bottom = Math.max(base, safe.bottom);
  const left = Math.max(base, safe.left);
  return {css: `${top}px ${right}px ${bottom}px ${left}px`, top, right, bottom, left, innerWidth: width - left - right, innerHeight: height - top - bottom};
};

/** Canvas size, title-safe rectangle, and a 1080-relative scale for sizes authored at 1080p. */
export const usePresetFrame = () => {
  const {width, height} = useVideoConfig();
  const metrics = canvasMetrics(width, height);
  return {...metrics, scale: Math.min(width, height) / 1080};
};

type CopyProps = {
  text: string | undefined;
  width: number;
  height: number;
  /** The authored size: the largest the copy may grow to. */
  size: number;
  /** Smallest acceptable size before the block reports overflow. */
  minSize?: number;
  weight: number;
  direction?: PresetProps['direction'];
  role?: PresetProps['typeface'];
  align?: CSSProperties['textAlign'];
  verticalAlign?: 'start' | 'center' | 'end';
  maxLines?: number;
  color?: string;
  style?: CSSProperties;
};

/**
 * A block of preset copy. Short text keeps the authored size; longer text shrinks to fit the box
 * (never below `minSize`) and wraps on whole words. Missing optional copy renders nothing.
 */
export const Copy: FC<CopyProps> = ({text, width, height, size, minSize, weight, direction, role, align, verticalAlign = 'start', maxLines, color, style}) => {
  if (!text?.trim()) return null;
  return (
    <FittedText
      text={text}
      box={{width: Math.floor(width), height: Math.floor(height)}}
      maxSize={Math.round(size)}
      minSize={Math.max(10, Math.round(minSize ?? size * 0.45))}
      weight={weight}
      direction={direction}
      role={role}
      align={align}
      verticalAlign={verticalAlign}
      // Stacked copy keeps its natural rhythm; the box is only the size limit.
      fitHeight
      maxLines={maxLines}
      color={color}
      style={style}
    />
  );
};
