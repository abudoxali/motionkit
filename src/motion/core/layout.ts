import {useVideoConfig} from 'remotion';

// Responsive composition coordinates. Components describe positions in units of the canvas so
// one implementation works in 16:9, 9:16, and 1:1 without per-format branches.

export type SafeArea = {top: number; right: number; bottom: number; left: number};

/**
 * Title-safe insets in composition pixels. Vertical formats reserve extra space for platform UI
 * (captions, buttons) at the top and bottom of short-form feeds.
 */
export const safeAreaFor = (width: number, height: number): SafeArea => {
  const portrait = height > width * 1.2;
  const side = Math.round(width * (portrait ? 0.07 : 0.06));
  return {
    top: Math.round(height * (portrait ? 0.1 : 0.08)),
    bottom: Math.round(height * (portrait ? 0.14 : 0.08)),
    left: side,
    right: side,
  };
};

export type Orientation = 'landscape' | 'portrait' | 'square';

export type CanvasMetrics = {
  width: number;
  height: number;
  orientation: Orientation;
  /** 1% of the shorter side. */
  vmin: number;
  safe: SafeArea;
  /** Safe-area rectangle in composition pixels. */
  safeRect: {x: number; y: number; width: number; height: number};
};

export const orientationOf = (width: number, height: number): Orientation =>
  Math.abs(width - height) < Math.min(width, height) * 0.05 ? 'square' : width > height ? 'landscape' : 'portrait';

export const canvasMetrics = (width: number, height: number): CanvasMetrics => {
  if (!(width > 0 && height > 0)) throw new RangeError('Canvas dimensions must be positive.');
  const safe = safeAreaFor(width, height);
  return {
    width,
    height,
    orientation: orientationOf(width, height),
    vmin: Math.min(width, height) / 100,
    safe,
    safeRect: {x: safe.left, y: safe.top, width: width - safe.left - safe.right, height: height - safe.top - safe.bottom},
  };
};

export const useCanvas = () => {
  const {width, height} = useVideoConfig();
  return canvasMetrics(width, height);
};

/** Point from normalised safe-area coordinates (0..1 on each axis) to composition pixels. */
export const safePoint = (metrics: CanvasMetrics, u: number, v: number) => ({
  x: metrics.safeRect.x + metrics.safeRect.width * u,
  y: metrics.safeRect.y + metrics.safeRect.height * v,
});

/** Mirrors a horizontal offset for RTL layouts so "forward" always follows reading direction. */
export const inline = (value: number, direction: 'rtl' | 'ltr') => (direction === 'rtl' ? -value : value);
