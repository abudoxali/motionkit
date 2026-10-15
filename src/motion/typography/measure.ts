import {splitWords} from './script';

export type FontSpec = {family: string; weight: number; size: number};

/** Returns the advance width of `text` in pixels for the given font. Must be deterministic. */
export type TextMeasurer = (text: string, font: FontSpec) => number;

export const cssFont = ({family, weight, size}: FontSpec) => `${weight} ${size}px ${family}`;

let sharedContext: CanvasRenderingContext2D | null = null;

/**
 * Canvas measurement with real shaping: Arabic contextual forms and ligatures are measured as
 * they will render. Only call it after the project fonts report ready, otherwise the browser
 * measures its fallback font.
 */
export const canvasMeasurer: TextMeasurer = (text, font) => {
  if (!sharedContext) {
    if (typeof document === 'undefined') throw new Error('Canvas text measurement needs a DOM.');
    sharedContext = document.createElement('canvas').getContext('2d');
    if (!sharedContext) throw new Error('Canvas 2D context is unavailable for text measurement.');
  }
  sharedContext.font = cssFont(font);
  return sharedContext.measureText(text).width;
};

/**
 * Font content-area height (ascent + descent) in ems, from the font's own metrics. Arabic display
 * faces such as Cairo reserve ~1.9 em for stacked marks, more than any sensible line-height, so
 * the first and last lines need that overhang inside the box or their marks get clipped.
 */
export const canvasFontExtent = (font: FontSpec) => {
  canvasMeasurer('ا', font);
  const metrics = sharedContext!.measureText('ا');
  return (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / font.size;
};

/**
 * How far glyph ink reaches beyond the line's advance box on either side, in pixels. Arabic
 * initial and final forms often overhang their advance width, so a line that fits exactly still
 * gets its first or last letter clipped by any container edge unless this space is reserved.
 */
export const canvasInkOverhang = (text: string, font: FontSpec) => {
  canvasMeasurer(text, font);
  const metrics = sharedContext!.measureText(text);
  return Math.max(0, metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxRight - metrics.width);
};

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;
const LATIN = /[A-Za-z]/;
/** Short Latin runs inside Arabic copy (names like "Remotion Studio") wrap as one unit. */
const MAX_GLUED_LATIN_WORDS = 3;

/**
 * Wrapping units: words, except that inside Arabic copy a run of up to three consecutive Latin
 * words stays together, so a product name is never split across two RTL lines.
 */
export const wrapUnits = (text: string) => {
  const words = splitWords(text);
  if (!ARABIC.test(text)) return words;
  const units: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length <= MAX_GLUED_LATIN_WORDS) units.push(run.join(' '));
    else units.push(...run);
    run = [];
  };
  for (const word of words) {
    if (LATIN.test(word) && !ARABIC.test(word)) {
      run.push(word);
    } else {
      flush();
      units.push(word);
    }
  }
  flush();
  return units;
};

/**
 * Greedy word wrap. Words are never split; a single word wider than `maxWidth` stays on its own
 * line and is reported through `fitText().overflow` instead of being broken into letters.
 */
export const wrapWords = (
  text: string,
  maxWidth: number,
  font: FontSpec,
  measure: TextMeasurer,
): string[] => {
  const lines: string[] = [];
  let line = '';
  // A glued Latin run that is wider than the line on its own falls back to ordinary words.
  const units = wrapUnits(text).flatMap((unit) => (unit.includes(' ') && measure(unit, font) > maxWidth ? splitWords(unit) : [unit]));
  for (const word of units) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate, font) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

export type FitOptions = {
  text: string;
  family: string;
  weight: number;
  maxWidth: number;
  maxHeight: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  minSize: number;
  maxSize: number;
  maxLines?: number;
  measure: TextMeasurer;
  /** Content-area height in ems; when larger than lineHeight the block reserves the overhang. */
  extent?: (font: FontSpec) => number;
  /** Horizontal glyph-ink overhang of a line in pixels; reserved on both inline sides. */
  ink?: (text: string, font: FontSpec) => number;
};

export type FitResult = {
  fontSize: number;
  lines: string[];
  /** Widest measured line, in pixels. */
  width: number;
  height: number;
  /** Space reserved above the first and below the last line for marks beyond the line box. */
  overhang: number;
  /** Space reserved on each inline side for glyph ink beyond the advance box. */
  inkPadding: number;
  /** True when even `minSize` cannot fit; callers must surface it, never clip silently. */
  overflow: boolean;
};

const layoutAt = (options: FitOptions, size: number): FitResult => {
  const font = {family: options.family, weight: options.weight, size};
  // Ink reach depends on the glyphs at each line edge: estimate it on the whole text, wrap, then
  // re-measure every wrapped line and re-wrap once if a line edge reaches further.
  const inkOf = (texts: string[]) => (options.ink ? Math.ceil(Math.max(0, ...texts.map((item) => options.ink!(item, font)))) : 0);
  let inkPadding = inkOf([options.text]);
  let innerWidth = options.maxWidth - inkPadding * 2;
  let lines = wrapWords(options.text, innerWidth, font, options.measure);
  const lineInk = inkOf(lines);
  if (lineInk > inkPadding) {
    inkPadding = lineInk;
    innerWidth = options.maxWidth - inkPadding * 2;
    lines = wrapWords(options.text, innerWidth, font, options.measure);
  }
  const width = Math.max(0, ...lines.map((line) => options.measure(line, font)));
  const extent = options.extent ? options.extent(font) : options.lineHeight;
  const overhang = Math.max(0, ((extent - options.lineHeight) / 2) * size);
  const height = lines.length * size * options.lineHeight + overhang * 2;
  const overflow =
    innerWidth <= 0 ||
    width > innerWidth + 0.5 ||
    height > options.maxHeight + 0.5 ||
    (options.maxLines !== undefined && lines.length > options.maxLines);
  return {fontSize: size, lines, width, height, overhang, inkPadding, overflow};
};

/** Largest integer font size in [minSize, maxSize] whose wrapped layout fits the box. */
export const fitText = (options: FitOptions): FitResult => {
  const {minSize, maxSize, maxWidth, maxHeight, lineHeight} = options;
  for (const [name, value] of Object.entries({minSize, maxSize, maxWidth, maxHeight, lineHeight})) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`fitText: ${name} must be a positive number.`);
  }
  if (minSize > maxSize) throw new RangeError('fitText: minSize must not exceed maxSize.');

  let low = Math.ceil(minSize);
  let high = Math.floor(maxSize);
  let best: FitResult | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const result = layoutAt(options, middle);
    if (result.overflow) {
      high = middle - 1;
    } else {
      best = result;
      low = middle + 1;
    }
  }
  return best ?? layoutAt(options, Math.ceil(minSize));
};
