import {Fragment, createContext, useContext, useMemo} from 'react';
import type {CSSProperties, FC, ReactNode} from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TextDirection} from '../types';
import {fontStack, getFontFamily, resolveWeight} from './fonts';
import type {FontRole} from './fonts';
import {useProjectFontsReady} from './loader';
import {canvasFontExtent, canvasInkOverhang, canvasMeasurer, fitText} from './measure';
import type {FitResult, FontSpec, TextMeasurer} from './measure';
import {detectDirection, segmentScripts, splitWords, wordRuns} from './script';
import {canvasMetrics} from '../core/layout';
import {lineHeightFor, typeLevels, typeSize} from './tokens';
import type {TypeLevel} from './tokens';

export type TextMetricsProvider = {
  width: TextMeasurer;
  extent?: (font: FontSpec) => number;
  ink?: (text: string, font: FontSpec) => number;
};

/** Lets tests (and future renderers) replace canvas measurement with a deterministic stub. */
export const TextMeasureContext = createContext<TextMetricsProvider>({width: canvasMeasurer, extent: canvasFontExtent, ink: canvasInkOverhang});

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/**
 * Renders copy with Latin runs inside Arabic (and Arabic runs inside English) isolated in <bdi>,
 * so terms like "Claude" or "MP4" keep their order and punctuation lands on the correct side.
 */
export const MixedText: FC<{text: string; direction: TextDirection}> = ({text, direction}) => {
  const foreign = direction === 'rtl' ? 'latin' : 'arabic';
  return (
    <>
      {segmentScripts(text).map((run, index) =>
        run.script === foreign ? <bdi key={index}>{run.text}</bdi> : <span key={index}>{run.text}</span>,
      )}
    </>
  );
};

type TextStyleProps = {
  level?: TypeLevel;
  role?: FontRole;
  weight?: number;
  direction?: TextDirection;
  color?: string;
  align?: CSSProperties['textAlign'];
  style?: CSSProperties;
};

const resolveTextStyle = (
  text: string,
  {level = 'body', role, weight, direction, color, align}: TextStyleProps,
) => {
  const dir = direction ?? detectDirection(text);
  const fontRole = role ?? typeLevels[level].role;
  return {
    dir,
    fontRole,
    weight: resolveWeight(fontRole, weight ?? typeLevels[level].weight),
    lineHeight: lineHeightFor(dir, level),
    css: {
      color,
      textAlign: align ?? 'start',
      unicodeBidi: 'isolate',
      fontKerning: 'normal',
      // Arabic must never be letter-spaced: it breaks the joins between letters.
      letterSpacing: 0,
    } satisfies CSSProperties,
  };
};

/** Static text at a token size. Use FittedText when the copy length is not fixed. */
export const Text: FC<TextStyleProps & {text: string; size?: number}> = ({text, size, style, ...props}) => {
  const {width, height} = useVideoConfig();
  const resolved = resolveTextStyle(text, props);
  return (
    <div
      dir={resolved.dir}
      style={{
        ...resolved.css,
        fontFamily: fontStack(resolved.fontRole),
        fontWeight: resolved.weight,
        fontSize: size ?? typeSize(props.level ?? 'body', width, height),
        lineHeight: resolved.lineHeight,
        ...style,
      }}
    >
      <MixedText text={text} direction={resolved.dir} />
    </div>
  );
};

export const Heading: FC<Omit<TextStyleProps, 'level'> & {text: string; size?: number}> = (props) => (
  <Text {...props} level="heading" />
);

export const BodyText: FC<Omit<TextStyleProps, 'level'> & {text: string; size?: number}> = (props) => (
  <Text {...props} level="body" />
);

export type FitBox = {width: number; height: number};

export type FittedLayout = FitResult & {family: string; weight: number; lineHeight: number; direction: TextDirection};

/** Measures after the bundled fonts load and returns the largest layout that fits `box`. */
export const useFittedText = (
  rawText: string,
  box: FitBox,
  props: TextStyleProps & {minSize?: number; maxSize?: number; maxLines?: number} = {},
): FittedLayout | null => {
  // Props arrive from users and the library; a missing string renders nothing instead of crashing.
  const text = typeof rawText === 'string' ? rawText : '';
  const ready = useProjectFontsReady();
  const measure = useContext(TextMeasureContext);
  const resolved = resolveTextStyle(text, props);
  const family = getFontFamily(resolved.fontRole).family;
  const floor = typeLevels[props.level ?? 'body'].floor;
  const {minSize = Math.max(1, Math.min(floor, box.height)), maxSize = Math.max(box.height, minSize), maxLines} = props;
  return useMemo(() => {
    if (!ready) return null;
    const layoutBase = {family, weight: resolved.weight, lineHeight: resolved.lineHeight, direction: resolved.dir};
    if (!(box.width > 0 && box.height > 0)) {
      // A collapsed box is a layout problem to surface, not a reason to crash the render.
      return {...layoutBase, fontSize: minSize > 0 ? minSize : 1, lines: [text], width: 0, height: 0, overhang: 0, inkPadding: 0, overflow: true};
    }
    const result = fitText({
      text,
      family: fontStack(resolved.fontRole),
      weight: resolved.weight,
      maxWidth: box.width,
      maxHeight: box.height,
      lineHeight: resolved.lineHeight,
      minSize,
      maxSize,
      maxLines,
      measure: measure.width,
      extent: measure.extent,
      ink: measure.ink,
    });
    return {...result, ...layoutBase};
  }, [ready, text, family, resolved.fontRole, resolved.weight, resolved.lineHeight, resolved.dir, box.width, box.height, minSize, maxSize, maxLines, measure]);
};

type FittedTextProps = TextStyleProps & {
  text: string;
  box: FitBox;
  /** Where the lines sit inside the box vertically; independent of `align`. */
  verticalAlign?: 'start' | 'center' | 'end';
  /** Take the measured height of the fitted lines instead of the whole box (box height stays the limit). */
  fitHeight?: boolean;
  minSize?: number;
  maxSize?: number;
  maxLines?: number;
  /** Renders each fitted line; defaults to plain mixed-script text. */
  renderLine?: (line: string, index: number, layout: FittedLayout) => ReactNode;
};

/**
 * Text that sizes itself to the space it is given. Lines are computed from real glyph widths
 * and rendered explicitly, so the browser cannot re-wrap them differently from the measurement.
 * The box exposes data-typography-fit for QA; overflow is reported, never silently clipped.
 */
export const FittedText: FC<FittedTextProps> = ({text, box, renderLine, style, verticalAlign = 'start', fitHeight = false, ...props}) => {
  const layout = useFittedText(text, box, props);
  const resolved = resolveTextStyle(text, props);
  const justify = verticalAlign === 'start' ? 'flex-start' : verticalAlign === 'end' ? 'flex-end' : 'center';
  return (
    <div
      dir={resolved.dir}
      data-typography-fit={layout ? (layout.overflow ? 'overflow' : 'ok') : 'pending'}
      data-typography-size={layout?.fontSize}
      style={{
        ...resolved.css,
        width: box.width,
        height: fitHeight && layout ? Math.min(box.height, Math.ceil(layout.height)) : box.height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        fontFamily: fontStack(resolved.fontRole),
        fontWeight: resolved.weight,
        fontSize: layout?.fontSize,
        lineHeight: resolved.lineHeight,
        boxSizing: 'border-box',
        paddingBlock: layout?.overhang,
        paddingInline: layout?.inkPadding,
        visibility: layout ? 'visible' : 'hidden',
        ...style,
      }}
    >
      {layout?.lines.map((line, index) => (
        <div key={index} style={{whiteSpace: 'nowrap'}}>
          {renderLine ? renderLine(line, index, layout) : <MixedText text={line} direction={layout.direction} />}
        </div>
      ))}
    </div>
  );
};

export type StackLayout = {fontSize: number; lineHeight: number; direction: TextDirection; overhang: number; inkPadding: number; overflow: boolean};

/**
 * One shared size for lines that must each stay on a single line (a stacked headline): every line
 * fits the width, and all lines together fit the height. Rhythm stays consistent because no line
 * gets its own size.
 */
export const useFittedStack = (
  lines: readonly string[],
  box: FitBox,
  props: TextStyleProps & {minSize?: number; maxSize?: number} = {},
): StackLayout | null => {
  const ready = useProjectFontsReady();
  const measure = useContext(TextMeasureContext);
  const sample = lines.join(' ');
  const resolved = resolveTextStyle(sample, props);
  const floor = typeLevels[props.level ?? 'body'].floor;
  const count = Math.max(1, lines.length);
  const rowHeight = box.height / count;
  const {minSize = Math.max(1, Math.min(floor, rowHeight)), maxSize = Math.max(rowHeight, minSize)} = props;
  const key = JSON.stringify(lines);
  return useMemo(() => {
    if (!ready) return null;
    const base = {lineHeight: resolved.lineHeight, direction: resolved.dir};
    if (!(box.width > 0 && rowHeight > 0) || lines.length === 0) {
      return {...base, fontSize: Math.max(1, minSize), overhang: 0, inkPadding: 0, overflow: lines.length > 0};
    }
    const fits = lines.map((line) =>
      fitText({
        text: line,
        family: fontStack(resolved.fontRole),
        weight: resolved.weight,
        maxWidth: box.width,
        maxHeight: rowHeight,
        lineHeight: resolved.lineHeight,
        minSize,
        maxSize,
        maxLines: 1,
        measure: measure.width,
        extent: measure.extent,
        ink: measure.ink,
      }),
    );
    const fontSize = Math.min(...fits.map((fit) => fit.fontSize));
    return {
      ...base,
      fontSize,
      overhang: Math.max(...fits.map((fit) => fit.overhang)),
      inkPadding: Math.max(...fits.map((fit) => fit.inkPadding)),
      overflow: fits.some((fit) => fit.overflow),
    };
    // `key` stands in for the lines array so a new array with the same words does not refit.
  }, [ready, key, resolved.fontRole, resolved.weight, resolved.lineHeight, resolved.dir, box.width, rowHeight, minSize, maxSize, measure]);
};

/** The composition's title-safe box, for FittedText and layout math. */
export const useSafeBox = () => {
  const {width, height} = useVideoConfig();
  const {safe, safeRect} = canvasMetrics(width, height);
  return {safe, box: {width: safeRect.width, height: safeRect.height}};
};

/** Fills a fraction of the safe area; the copy is fitted, so any language or length is safe. */
export const ResponsiveTextBlock: FC<Omit<FittedTextProps, 'box'> & {heightFraction?: number}> = ({
  heightFraction = 0.4,
  ...props
}) => {
  const {box} = useSafeBox();
  return <FittedText {...props} box={{width: box.width, height: Math.round(box.height * heightFraction)}} />;
};

export type WordReveal = {from?: number; stagger?: number; duration?: number; rise?: number};

const wordProgress = (frame: number, index: number, {from = 0, stagger = 5, duration = 12}: WordReveal) =>
  interpolate(frame, [from + index * stagger, from + index * stagger + duration], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

/**
 * Word-by-word kinetic reveal. Each word is one element with its letters intact; order follows
 * the paragraph direction, so Arabic enters right-to-left without any manual reordering.
 */
export const KineticWords: FC<Omit<FittedTextProps, 'renderLine'> & WordReveal & {accentWords?: number[]; accent?: string}> = ({
  from,
  stagger,
  duration,
  rise = 0.35,
  accentWords = [],
  accent,
  ...props
}) => {
  const frame = useCurrentFrame();
  const reveal = {from, stagger, duration};
  return (
    <FittedText
      {...props}
      renderLine={(line, lineIndex, layout) => {
        const offset = layout.lines.slice(0, lineIndex).reduce((sum, item) => sum + splitWords(item).length, 0);
        return splitWords(line).map((word, wordIndex) => {
          const index = offset + wordIndex;
          const progress = wordProgress(frame, index, reveal);
          return (
            <span key={index} style={{display: 'inline-block', opacity: progress, translate: `0 ${(1 - progress) * rise * layout.fontSize}px`, color: accentWords.includes(index) ? accent : undefined}}>
              <MixedText text={word} direction={layout.direction} />
              {wordIndex < splitWords(line).length - 1 ? ' ' : null}
            </span>
          );
        });
      }}
    />
  );
};

/**
 * Highlights whole words `[start, end)` with a marker that sweeps in reading direction. Indices
 * are word indices, so a highlight can never cut through an Arabic word.
 */
export const HighlightedPhrase: FC<Omit<FittedTextProps, 'renderLine'> & {highlight: [number, number]; accent: string; progress: number}> = ({
  highlight,
  accent,
  progress,
  ...props
}) => (
  <FittedText
    {...props}
    renderLine={(line, lineIndex, layout) => {
      const offset = layout.lines.slice(0, lineIndex).reduce((sum, item) => sum + splitWords(item).length, 0);
      const words = splitWords(line);
      return words.map((word, wordIndex) => {
        const index = offset + wordIndex;
        const marked = index >= highlight[0] && index < highlight[1];
        // The sweep travels through the highlighted words in reading order, one after another.
        const span = Math.max(1, highlight[1] - highlight[0]);
        const local = Math.max(0, Math.min(1, progress * span - (index - highlight[0])));
        const last = wordIndex === words.length - 1;
        // A trailing normal space collapses at the end of an inline-block, which left a gap between
        // marks. Keep a non-collapsing space inside the box when the next word is also marked (so
        // the marks join into one stroke), and outside it otherwise (so the mark stops at the word).
        const joinNext = !last && marked && index + 1 < highlight[1];
        return (
          <Fragment key={index}>
          <span style={{position: 'relative', display: 'inline-block'}}>
            {marked ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  insetInlineStart: 0,
                  bottom: '0.12em',
                  height: '0.42em',
                  width: `${local * 100}%`,
                  background: accent,
                  opacity: 0.55,
                  borderRadius: '0.12em',
                }}
              />
            ) : null}
            <span style={{position: 'relative'}}><MixedText text={word} direction={layout.direction} /></span>
            {joinNext ? ' ' : null}
          </span>
          {!last && !joinNext ? ' ' : null}
          </Fragment>
        );
      });
    }}
  />
);

export type TimedWord = {text: string; startFrame: number; endFrame: number};

/**
 * Caption line driven by word timings (from scripts/align.py or a project timeline). The whole
 * line is fitted once, so highlighting a word never changes the layout mid-sentence.
 */
export const Subtitle: FC<Omit<FittedTextProps, 'text' | 'renderLine'> & {words: TimedWord[]; accent: string; mutedOpacity?: number}> = ({
  words,
  accent,
  mutedOpacity = 0.45,
  ...props
}) => {
  const frame = useCurrentFrame();
  // One entry per whitespace-separated token, so a timed phrase such as «الـ MP4» keeps every
  // later word aligned with its own timing.
  const tokens = words.flatMap((word) => splitWords(word.text).map((text) => ({...word, text})));
  const text = tokens.map((token) => token.text).join(' ');
  return (
    <FittedText
      {...props}
      text={text}
      renderLine={(line, lineIndex, layout) => {
        const offset = layout.lines.slice(0, lineIndex).reduce((sum, item) => sum + splitWords(item).length, 0);
        const lineWords = splitWords(line);
        const wordSpan = (word: string, wordIndex: number, trailingSpace: boolean) => {
          const timing = tokens[offset + wordIndex];
          const spoken = timing ? frame >= timing.startFrame : true;
          const active = timing ? frame >= timing.startFrame && frame < timing.endFrame : false;
          return (
            <span key={wordIndex} style={{opacity: spoken ? 1 : mutedOpacity, color: active ? accent : undefined}}>
              <MixedText text={word} direction={layout.direction} />
              {trailingSpace ? ' ' : null}
            </span>
          );
        };
        // Consecutive words in the other script ("ABUD Motion Studio" inside Arabic) form one
        // isolated run, so they keep their own order; isolating each word separately would let
        // the line direction reverse them ("Studio Motion ABUD").
        return wordRuns(lineWords, layout.direction).map((run) =>
          run.foreign ? (
            <Fragment key={`run-${run.start}`}>
              <bdi dir={layout.direction === 'rtl' ? 'ltr' : 'rtl'}>
                {run.words.map((word, index) => wordSpan(word, run.start + index, index < run.words.length - 1))}
              </bdi>
              {run.start + run.words.length < lineWords.length ? ' ' : null}
            </Fragment>
          ) : (
            run.words.map((word, index) => wordSpan(word, run.start + index, run.start + index < lineWords.length - 1))
          ),
        );
      }}
    />
  );
};
