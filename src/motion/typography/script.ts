import type {TextDirection} from '../types';

// Script analysis for Arabic, English, and mixed copy. Everything here works on whole words:
// splitting below the word level would break Arabic joining, so no helper ever does it.

const ARABIC_LETTER = /[؀-ۿݐ-ݿࡰ-ࣿﭐ-﷿ﹰ-﻿]/u;
const STRONG_ARABIC = /[ؠ-يٮ-ۓەۺ-ۿݐ-ݿﭐ-﷿ﹰ-ﻼ]/u;
const STRONG_LATIN = /[A-Za-zÀ-ɏ]/u;

export const containsArabic = (text: string) => ARABIC_LETTER.test(text);

/** Direction of the first strongly directional character, matching the Unicode "auto" rule. */
export const detectDirection = (text: string, fallback: TextDirection = 'ltr'): TextDirection => {
  for (const character of text) {
    if (STRONG_ARABIC.test(character)) return 'rtl';
    if (STRONG_LATIN.test(character)) return 'ltr';
  }
  return fallback;
};

/**
 * Direction of the script with more strongly directional letters, for choosing a layout's reading
 * side: Arabic copy that opens with a Latin name ("ABUD Motion Studio بيخلّي …") is still an RTL
 * layout, which the first-character rule gets wrong. A tie (including text with no letters) returns
 * `fallback`, so an Arabic-first caller passes 'rtl'.
 */
export const dominantDirection = (text: string, fallback: TextDirection = 'ltr'): TextDirection => {
  let arabic = 0;
  let latin = 0;
  for (const character of text) {
    if (STRONG_ARABIC.test(character)) arabic += 1;
    else if (STRONG_LATIN.test(character)) latin += 1;
  }
  return arabic === latin ? fallback : arabic > latin ? 'rtl' : 'ltr';
};

/** Words in logical order. Punctuation stays attached, so «طيب،» never loses its comma. */
export const splitWords = (text: string) => text.trim().split(/\s+/u).filter(Boolean);

export type ScriptRun = {text: string; script: 'arabic' | 'latin' | 'neutral'};

type CharClass = 'arabic' | 'latin' | 'digit' | 'neutral';

const classify = (character: string): CharClass =>
  STRONG_ARABIC.test(character) || ARABIC_LETTER.test(character)
    ? 'arabic'
    : STRONG_LATIN.test(character)
      ? 'latin'
      : /[0-9]/.test(character)
        ? 'digit'
        : 'neutral';

/**
 * Groups text into script runs so Latin terms inside Arabic copy (or the reverse) can be wrapped
 * in <bdi> without changing the order the browser would have produced:
 * - Western digits join a Latin run when the previous strong letter is Latin (Unicode rule W7,
 *   so "MP4" and "Aa 0123" stay together) or when they touch a following Latin letter ("4K").
 * - Neutrals (spaces, punctuation) between two characters of one script join that run.
 * - Everything else stays neutral and is resolved by the paragraph direction, which keeps
 *   Arabic punctuation and Arabic-Indic digits in Arabic order.
 */
export const segmentScripts = (text: string): ScriptRun[] => {
  const characters = Array.from(text);
  const classes = characters.map(classify);
  let previousStrong: CharClass | null = null;
  const resolved = classes.map((kind, index) => {
    if (kind === 'arabic' || kind === 'latin') {
      previousStrong = kind;
      return kind;
    }
    if (kind === 'digit') {
      let next = index;
      while (classes[next] === 'digit') next += 1;
      return previousStrong === 'latin' || classes[next] === 'latin' ? 'latin' : 'neutral';
    }
    return 'neutral';
  });

  // Neutral stretches enclosed by the same script on both sides belong to that script.
  for (let start = 0; start < resolved.length; start += 1) {
    if (resolved[start] !== 'neutral') continue;
    let end = start;
    while (end < resolved.length && resolved[end] === 'neutral') end += 1;
    const before = resolved[start - 1];
    if (before && before === resolved[end]) resolved.fill(before, start, end);
    start = end - 1;
  }

  const runs: ScriptRun[] = [];
  characters.forEach((character, index) => {
    const script = resolved[index] as ScriptRun['script'];
    const last = runs[runs.length - 1];
    if (last && last.script === script) last.text += character;
    else runs.push({text: character, script});
  });
  return runs;
};

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

export type NumeralSystem = 'western' | 'arabic-indic';

/** Pick one numeral system per video and apply it everywhere. */
export const formatNumerals = (text: string, system: NumeralSystem) =>
  system === 'arabic-indic'
    ? text.replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)])
    : text.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)));

/** Loose comparison key for matching script words to aligned audio; never use it for display. */
export const normalizeArabic = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Minimum on-screen hold for a caption line: 0.3 s per word plus 0.6 s, in frames. */
export const minimumReadingFrames = (text: string, fps: number) =>
  Math.ceil((splitWords(text).length * 0.3 + 0.6) * fps);

export type WordRun = {start: number; words: string[]; foreign: boolean};

/**
 * Groups whole words into runs for a line of the given direction: consecutive words written in the
 * other script (Latin inside RTL, Arabic inside LTR) form one "foreign" run that must be isolated
 * as a unit to keep its internal order. Script-neutral words (numbers, symbols) between two foreign
 * words stay inside the run. Words are never split.
 */
export const wordRuns = (words: readonly string[], direction: TextDirection): WordRun[] => {
  const foreignScript = direction === 'rtl' ? 'latin' : 'arabic';
  const kindOf = (word: string): 'foreign' | 'native' | 'neutral' => {
    const scripts = new Set(segmentScripts(word).map((run) => run.script));
    const nativeScript = direction === 'rtl' ? 'arabic' : 'latin';
    if (scripts.has(foreignScript) && !scripts.has(nativeScript)) return 'foreign';
    return scripts.has('arabic') || scripts.has('latin') ? 'native' : 'neutral';
  };
  const kinds = words.map(kindOf);
  const isForeign = kinds.map((kind, index) => {
    if (kind !== 'neutral') return kind === 'foreign';
    const before = kinds.slice(0, index).reverse().find((item) => item !== 'neutral');
    const after = kinds.slice(index + 1).find((item) => item !== 'neutral');
    return before === 'foreign' && after === 'foreign';
  });
  const runs: WordRun[] = [];
  words.forEach((word, index) => {
    const last = runs[runs.length - 1];
    if (last && last.foreign && isForeign[index]) last.words.push(word);
    else if (isForeign[index]) runs.push({start: index, words: [word], foreign: true});
    else runs.push({start: index, words: [word], foreign: false});
  });
  return runs;
};
