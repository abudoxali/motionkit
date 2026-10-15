import {defineProject} from '../contract';
import type {TypographyFixtureProps} from '../../motion/typography/fixtures/TypographyFixture';

const sheets = {
  specimens: {
    title: 'Typography QA · Specimens',
    summary: 'Short and long Arabic, Egyptian colloquial, mixed English, numerals, diacritics, and punctuation in fitted boxes.',
    prefix: 'QA-Typography-Specimens',
  },
  motion: {
    title: 'Typography QA · Weights & motion',
    summary: 'Every bundled weight plus KineticWords, Subtitle, and HighlightedPhrase at their settled frames.',
    prefix: 'QA-Typography-Motion',
  },
  bidi: {
    title: 'Typography QA · Bidi edge cases',
    summary: 'Percent signs, Latin identifiers with digits, both numeral systems, and mixed-direction wrapping inside RTL copy.',
    prefix: 'QA-Typography-Bidi',
  },
} as const;

const fixture = (sheet: TypographyFixtureProps['sheet']) =>
  defineProject<TypographyFixtureProps>({
    id: `typography-${sheet}`,
    title: sheets[sheet].title,
    summary: sheets[sheet].summary,
    kind: 'fixture',
    language: 'ar-en',
    direction: 'rtl',
    fps: 30,
    durationInFrames: 90,
    compositions: [
      {id: `${sheets[sheet].prefix}-Horizontal`, format: 'horizontal'},
      {id: `${sheets[sheet].prefix}-Vertical`, format: 'vertical'},
      {id: `${sheets[sheet].prefix}-Square`, format: 'square'},
    ],
    styleId: 'custom',
    scenes: [{id: 'sheet', title: 'Settled sheet', from: 0, durationInFrames: 90, reviewFrame: 89}],
    fonts: ['display', 'text'],
    assets: [],
    defaultProps: {sheet, failOnIssues: true},
    editableProps: ['failOnIssues'],
    status: {stage: 'review-ready', notes: 'Self-auditing: the render is cancelled if any text overflows, leaves the safe area, or falls back.'},
  });

export const typographySpecimensMeta = fixture('specimens');
export const typographyMotionMeta = fixture('motion');
export const typographyBidiMeta = fixture('bidi');
