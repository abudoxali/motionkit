// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {cleanup, render} from '@testing-library/react';
import {Thumbnail} from '@remotion/player';
import type {ComponentType} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {
  ARABIC_RANGE,
  FittedText,
  KineticWords,
  MixedText,
  Subtitle,
  TextMeasureContext,
  containsArabic,
  detectDirection,
  fitText,
  fontFamilies,
  fontStack,
  formatNumerals,
  lineHeightFor,
  minimumReadingFrames,
  resolveWeight,
  safeAreaFor,
  segmentScripts,
  splitWords,
  typeSize,
  wrapUnits,
  wrapWords,
} from '../motion/typography';
import type {TextMeasurer} from '../motion/typography';
import {typographySamples} from '../motion/typography/fixtures/samples';

afterEach(cleanup);

// Deterministic stand-in for canvas measurement: every character is 0.5 em wide.
const fakeMeasure: TextMeasurer = (text, font) => Array.from(text).length * font.size * 0.5;
const fit = (text: string, overrides: Partial<Parameters<typeof fitText>[0]> = {}) =>
  fitText({text, family: 'Test', weight: 400, maxWidth: 400, maxHeight: 200, lineHeight: 1.4, minSize: 12, maxSize: 120, measure: fakeMeasure, ...overrides});

describe('font manifest', () => {
  it('ships every referenced face locally with its OFL license', () => {
    for (const family of fontFamilies) {
      expect(family.license).toBe('OFL-1.1');
      const license = readFileSync(path.resolve('public', family.licenseFile), 'utf8');
      expect(license).toContain('SIL Open Font License');
      for (const face of family.faces) {
        const file = path.resolve('public', face.file);
        expect(existsSync(file), face.file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(10_000);
        expect(readFileSync(file).subarray(0, 4).toString('latin1')).toBe('wOF2');
      }
    }
  });

  it('covers Arabic letters, marks, Arabic punctuation, and Arabic-Indic digits in the Arabic subset', () => {
    expect(ARABIC_RANGE).toContain('U+0600-06FF');
    expect(ARABIC_RANGE).toContain('U+FB50-FDFF');
  });

  it('never lists a system font in a stack and snaps to shipped weights', () => {
    for (const role of ['display', 'text'] as const) {
      const stack = fontStack(role);
      expect(stack).not.toMatch(/Segoe|Tahoma|Arial|sans-serif|Noto/i);
      expect(stack.split(',')).toHaveLength(2);
    }
    expect(resolveWeight('text', 800)).toBe(700);
    expect(resolveWeight('text', 500)).toBe(400);
    expect(resolveWeight('display', 850)).toBe(800);
  });
});

describe('Arabic and mixed-script analysis', () => {
  it('detects direction from the first strong character', () => {
    expect(detectDirection('ركّز في الأهم')).toBe('rtl');
    expect(detectDirection('Claude بيساعدك')).toBe('ltr');
    expect(detectDirection('2026 — سنة جديدة')).toBe('rtl');
    expect(detectDirection('123 ...', 'rtl')).toBe('rtl');
    expect(containsArabic('MP4')).toBe(false);
  });

  it('splits only on whitespace, keeping words, marks, and punctuation intact', () => {
    expect(splitWords('  يا عم ركّز بقى،  الموبايل!  ')).toEqual(['يا', 'عم', 'ركّز', 'بقى،', 'الموبايل!']);
    expect(splitWords('يَكْتُبُ الطَّالِبُ')).toEqual(['يَكْتُبُ', 'الطَّالِبُ']);
  });

  it('keeps Latin terms with their digits so MP4 never renders as 4MP', () => {
    const runs = segmentScripts('افتح Remotion Studio وراجع الـ MP4 قبل ما تضغط Export.');
    expect(runs.filter((run) => run.script === 'latin').map((run) => run.text)).toEqual(['Remotion Studio', 'MP4', 'Export']);
    expect(runs.map((run) => run.text).join('')).toBe('افتح Remotion Studio وراجع الـ MP4 قبل ما تضغط Export.');
  });

  it('applies the W7 digit rule and leaves Arabic-context numbers to the paragraph', () => {
    expect(segmentScripts('خط واضح Aa 0123 ٤٥٦').filter((run) => run.script === 'latin').map((run) => run.text)).toEqual(['Aa 0123']);
    expect(segmentScripts('شاشة 4K جديدة').filter((run) => run.script === 'latin').map((run) => run.text)).toEqual(['4K']);
    expect(segmentScripts('خصم 15% لمدة ٣ أيام').some((run) => run.script === 'latin')).toBe(false);
  });

  it('converts between numeral systems in both directions', () => {
    expect(formatNumerals('خصم 15% لمدة 3 أيام', 'arabic-indic')).toBe('خصم ١٥% لمدة ٣ أيام');
    expect(formatNumerals('٢٥٠ جنيه', 'western')).toBe('250 جنيه');
  });

  it('computes a minimum reading hold of 0.3 s per word plus 0.6 s', () => {
    expect(minimumReadingFrames('ركّز في الأهم', 30)).toBe(Math.ceil((3 * 0.3 + 0.6) * 30));
  });
});

describe('text fitting', () => {
  it('wraps on whole words only and keeps an over-long word on its own line', () => {
    const lines = wrapWords('كلمة طويلةجدًاجدًاجدًاجدًا قصيرة', 100, {family: 'Test', weight: 400, size: 10}, fakeMeasure);
    expect(lines).toEqual(['كلمة', 'طويلةجدًاجدًاجدًاجدًا', 'قصيرة']);
  });

  it('chooses the largest size that fits and shrinks as copy grows', () => {
    const short = fit('ركّز في الأهم');
    const long = fit('القراءة بالعربية أبطأ من الاستماع، لذلك نترك كل سطر على الشاشة وقتًا كافيًا');
    expect(short.overflow).toBe(false);
    expect(long.overflow).toBe(false);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.width).toBeLessThanOrEqual(400);
    expect(long.height).toBeLessThanOrEqual(200);
    const bigger = fit('ركّز في الأهم', {maxWidth: 401});
    expect(bigger.fontSize).toBeGreaterThanOrEqual(short.fontSize);
  });

  it('reserves glyph overhang above and below when the font is taller than the line-height', () => {
    const plain = fit('ركّز في الأهم');
    const tall = fit('ركّز في الأهم', {extent: () => 1.9});
    expect(tall.overhang).toBeGreaterThan(0);
    expect(tall.height).toBeLessThanOrEqual(200);
    expect(tall.fontSize).toBeLessThan(plain.fontSize);
  });

  it('honours maxLines and reports overflow instead of clipping at the readability floor', () => {
    expect(fit('واحد اثنين ثلاثة أربعة خمسة ستة', {maxLines: 1, maxWidth: 2000}).lines).toHaveLength(1);
    const impossible = fit('نص طويل جدا لا يمكن أن يظهر بحجم مقروء في هذا الصندوق الصغير', {maxHeight: 20, minSize: 26});
    expect(impossible.overflow).toBe(true);
    expect(impossible.fontSize).toBe(26);
  });

  it('keeps short Latin names together inside Arabic copy but not in English or long runs', () => {
    expect(wrapUnits('لما تفتح Remotion Studio وتختار Focus Doodle هتلاقي')).toEqual(['لما', 'تفتح', 'Remotion Studio', 'وتختار', 'Focus Doodle', 'هتلاقي']);
    expect(wrapUnits('Remotion Studio is local')).toEqual(['Remotion', 'Studio', 'is', 'local']);
    expect(wrapUnits('قال one two three four بسرعة')).toEqual(['قال', 'one', 'two', 'three', 'four', 'بسرعة']);
  });

  it('falls back to word wrapping when a glued Latin run is wider than the line', () => {
    const lines = wrapWords('افتح Remotion Studio Pro', 70, {family: 'Test', weight: 400, size: 10}, fakeMeasure);
    // The glued run (110px) cannot fit 70px, so it splits; «افتح Remotion» (65px) then fits one line.
    expect(lines).toEqual(['افتح Remotion', 'Studio Pro']);
  });

  it('measures ink at every wrapped line edge, not only on the unwrapped text', () => {
    // Only the word «خط» overhangs; it starts the second line, so the whole-text estimate misses it.
    const ink = (text: string, font: {size: number}) => (text.startsWith('خط') ? font.size : 0);
    const result = fit('كلمة كلمة خط', {maxHeight: 2000, maxWidth: 50, minSize: 10, maxSize: 10, ink});
    expect(result.lines.some((line) => line.startsWith('خط'))).toBe(true);
    expect(result.inkPadding).toBe(10);
    expect(result.overflow).toBe(false);
  });

  it('reserves measured glyph-ink overhang on both inline sides', () => {
    const wide = {maxHeight: 2000, maxLines: 1};
    const plain = fit('ركّز في الأهم', wide);
    const inked = fit('ركّز في الأهم', {...wide, ink: (_text, font) => font.size * 0.1});
    expect(plain.inkPadding).toBe(0);
    expect(inked.inkPadding).toBeGreaterThan(0);
    expect(inked.width + inked.inkPadding * 2).toBeLessThanOrEqual(400);
    expect(inked.fontSize).toBeLessThan(plain.fontSize);
  });

  it('rejects invalid boxes', () => {
    expect(() => fit('x', {maxWidth: 0})).toThrow(RangeError);
    expect(() => fit('x', {minSize: 50, maxSize: 10})).toThrow(RangeError);
    expect(() => fit('x', {lineHeight: Number.NaN})).toThrow(RangeError);
  });

  it('fits every typography fixture sample in a 1:1 safe area without breaking words', () => {
    const {left, right} = safeAreaFor(1080, 1080);
    for (const sample of typographySamples) {
      const result = fit(sample.text, {maxWidth: 1080 - left - right, maxHeight: 240, minSize: 16});
      expect(result.overflow, sample.id).toBe(false);
      expect(result.lines.join(' ')).toBe(splitWords(sample.text).join(' '));
    }
  });
});

describe('typography tokens', () => {
  it('gives Arabic more leading than Latin and keeps a readable floor', () => {
    expect(lineHeightFor('rtl')).toBeGreaterThanOrEqual(1.35);
    expect(lineHeightFor('rtl', 'display')).toBeGreaterThan(lineHeightFor('ltr', 'display'));
    expect(typeSize('body', 1080, 1920)).toBeGreaterThanOrEqual(26);
    expect(typeSize('display', 640, 360)).toBe(56);
  });

  it('reserves more vertical safe space on 9:16 than on 16:9', () => {
    const vertical = safeAreaFor(1080, 1920);
    const horizontal = safeAreaFor(1920, 1080);
    expect(vertical.bottom / 1920).toBeGreaterThan(horizontal.bottom / 1080);
  });
});

describe('typography components', () => {
  const metrics = {width: fakeMeasure};
  const thumbnail = (component: ComponentType, width = 1080, height = 1080) =>
    render(
      <TextMeasureContext.Provider value={metrics}>
        <Thumbnail component={component} compositionWidth={width} compositionHeight={height} frameToDisplay={60} durationInFrames={90} fps={30} />
      </TextMeasureContext.Provider>,
    );

  it('isolates Latin runs in <bdi> inside Arabic copy', () => {
    const {container} = render(<MixedText text="افتح Remotion Studio وراجع الـ MP4" direction="rtl" />);
    expect(Array.from(container.querySelectorAll('bdi')).map((node) => node.textContent)).toEqual(['Remotion Studio', 'MP4']);
  });

  it('renders fitted Arabic as explicit RTL lines of whole words', () => {
    const text = 'القراءة بالعربية أبطأ من الاستماع لذلك نترك كل سطر وقتًا كافيًا';
    const {container} = thumbnail(() => <FittedText text={text} box={{width: 600, height: 300}} />);
    const block = container.querySelector('[data-typography-fit]') as HTMLElement;
    expect(block).toHaveAttribute('data-typography-fit', 'ok');
    expect(block).toHaveAttribute('dir', 'rtl');
    expect(Array.from(block.children).map((line) => line.textContent).join(' ')).toBe(text);
  });

  it('keeps subtitle timing aligned when a timed entry holds several words', () => {
    const words = [
      {text: 'افتح', startFrame: 0, endFrame: 20},
      {text: 'الـ MP4', startFrame: 20, endFrame: 50},
      {text: 'دلوقتي', startFrame: 50, endFrame: 80},
    ];
    // frameToDisplay is 60, so only «دلوقتي» is active.
    const {container} = thumbnail(() => <Subtitle words={words} accent="rgb(255, 0, 0)" box={{width: 900, height: 200}} />);
    const active = Array.from(container.querySelectorAll('[data-typography-fit] span[style*="rgb(255, 0, 0)"]')).map((node) => node.textContent?.trim());
    expect(active).toEqual(['دلوقتي']);
  });

  it('reports a collapsed box as overflow instead of crashing the render', () => {
    const {container} = thumbnail(() => <FittedText text="ركّز" box={{width: 0, height: 0}} />);
    expect(container.querySelector('[data-typography-fit]')).toHaveAttribute('data-typography-fit', 'overflow');
  });

  it('reveals kinetic words as whole words with letters intact', () => {
    const text = 'كل كلمة تظهر كاملة في توقيتها';
    const {container} = thumbnail(() => <KineticWords text={text} box={{width: 900, height: 300}} stagger={4} />);
    const words = Array.from(container.querySelectorAll('[data-typography-fit] span[style*="inline-block"]')).map((node) => node.textContent?.replace(/ /g, ''));
    expect(words).toEqual(splitWords(text));
  });
});

describe('word runs for word-timed captions', () => {
  const thumbnail = (component: ComponentType) =>
    render(
      <TextMeasureContext.Provider value={{width: fakeMeasure}}>
        <Thumbnail component={component} compositionWidth={1920} compositionHeight={1080} frameToDisplay={60} durationInFrames={90} fps={30} />
      </TextMeasureContext.Provider>,
    );

  it('groups consecutive opposite-script words into one isolated run, never splitting words', async () => {
    const {wordRuns} = await import('../motion/typography/script');
    const runs = wordRuns(['جرّب', 'ABUD', 'Motion', 'Studio', 'دلوقتي'], 'rtl');
    expect(runs).toEqual([
      {start: 0, words: ['جرّب'], foreign: false},
      {start: 1, words: ['ABUD', 'Motion', 'Studio'], foreign: true},
      {start: 4, words: ['دلوقتي'], foreign: false},
    ]);
    expect(wordRuns(['صدّر', 'H.264', '4K', 'MP4', 'بسرعة'], 'rtl')[1]).toEqual({start: 1, words: ['H.264', '4K', 'MP4'], foreign: true});
    expect(wordRuns(['التوقيت', '100%'], 'rtl').map((run) => run.foreign)).toEqual([false, false]);
    expect(wordRuns(['Try', 'الخطة', 'الجديدة', 'now'], 'ltr')[1]).toEqual({start: 1, words: ['الخطة', 'الجديدة'], foreign: true});
    expect(wordRuns(['Plain', 'English'], 'ltr').every((run) => !run.foreign)).toBe(true);
  });

  it('renders a timed Latin run inside Arabic as one isolate in reading order', () => {
    const words = ['جرّب', 'ABUD', 'Motion', 'Studio', 'دلوقتي'].map((text, index) => ({text, startFrame: index * 10, endFrame: index * 10 + 10}));
    const {container} = thumbnail(() => <Subtitle words={words} accent="rgb(255, 0, 0)" direction="rtl" box={{width: 1400, height: 200}} />);
    const isolates = Array.from(container.querySelectorAll('[data-typography-fit] bdi[dir="ltr"]'));
    expect(isolates.map((node) => (node as Element).textContent?.replace(/\s+/g, ' ').trim())).toContain('ABUD Motion Studio');
    expect(container.querySelector('[data-typography-fit]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('جرّب ABUD Motion Studio دلوقتي');
  });
});
