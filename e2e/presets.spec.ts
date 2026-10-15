import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

// Structural and visual regression for the 12 catalog presets, rendered through /qa.html at a
// settled preview frame. Structure: fonts load, every fitted block fits, text stays inside the
// canvas and the title-safe area, no fallback glyphs, direction follows the props. Visual: one
// curated baseline per preset at 16:9, plus 9:16 where the layout is substantially different.

const PRESETS = [
  'kinetic-stack', 'title-orbit', 'lower-third-beam', 'logo-prism-reveal', 'marker-highlight', 'word-cascade',
  'hand-drawn-route', 'whiteboard-explainer', 'camera-parallax', 'count-up-stat', 'shape-morph', 'social-promo',
] as const;
const FORMATS = ['horizontal', 'vertical', 'square'] as const;
/** Presets whose 9:16 layout differs enough from 16:9 to deserve its own baseline. */
const VERTICAL_BASELINES = ['kinetic-stack', 'lower-third-beam', 'word-cascade', 'social-promo'];

const LONG_AR = 'كل فكرة كبيرة بتبدأ بخطوة صغيرة، وكل خطوة صغيرة محتاجة تركيز حقيقي على الحاجة الأهم الأول قبل اللي بعدها';
const LONG_AR_2 = 'جرّب نص أطول من المعتاد عشان نتأكد إن التصميم بيستوعبه من غير ما يتقص أو يخرج برة الإطار';
const LONG_EN = 'Every big idea starts with one small deliberate step toward the thing that matters most right now';
const LONG_EN_2 = 'A longer supporting line checks that the layout absorbs extra copy without clipping or leaving the frame';

type Block = {text: string; fit: string; direction: string; fontSize: number; fontFamily: string; insideCanvas: boolean; insideSafeArea: boolean};
type Qa = {status: string; fontState: string; issues: {kind: string; detail: string}[]; blocks: Block[]; error?: string};

const openPreset = async (page: Page, preset: string, format: string, props?: Record<string, unknown>, frame?: number) => {
  const query = new URLSearchParams({preset, format, scale: '0.5'});
  if (props) query.set('props', JSON.stringify(props));
  if (frame !== undefined) query.set('frame', String(frame));
  await page.goto(`/qa.html?${query}`);
  await page.waitForFunction(() => window.__qa?.status === 'ready' || window.__qa?.status === 'error');
  return (await page.evaluate(() => window.__qa)) as Qa;
};

const expectClean = (qa: Qa, label: string) => {
  expect(qa.error, label).toBeUndefined();
  expect(qa.fontState, label).toBe('ready');
  expect(qa.issues, label).toEqual([]);
  expect(qa.blocks.length, label).toBeGreaterThan(0);
  for (const block of qa.blocks) {
    expect(block.fontFamily, `${label}: ${block.text}`).toMatch(/^ABUD /);
    expect(block.insideSafeArea, `${label}: "${block.text.slice(0, 30)}" outside the title-safe area`).toBe(true);
  }
};

test('the harness knows exactly the 12 catalog presets', async ({page}) => {
  for (const preset of PRESETS) expect((await openPreset(page, preset, 'square')).error, preset).toBeUndefined();
  expect((await openPreset(page, 'not-a-preset', 'square')).error).toMatch(/Unknown preset/);
});

for (const preset of PRESETS) {
  test.describe(preset, () => {
    for (const format of FORMATS) {
      test(`${format}: default copy fits inside the safe area with bundled fonts`, async ({page}) => {
        expectClean(await openPreset(page, preset, format), `${preset}/${format}`);
      });
    }

    test('long Egyptian Arabic copy fits RTL in 9:16 and 16:9', async ({page}) => {
      for (const format of ['vertical', 'horizontal']) {
        const qa = await openPreset(page, preset, format, {text: LONG_AR, secondaryText: LONG_AR_2, direction: 'rtl'});
        expectClean(qa, `${preset}/${format}/ar`);
        const copy = qa.blocks.filter((block) => /[؀-ۿ]/.test(block.text));
        expect(copy.length, `${preset}/${format}`).toBeGreaterThan(0);
        for (const block of copy) expect(block.direction, block.text).toBe('rtl');
      }
    });

    test('long English copy fits LTR', async ({page}) => {
      const qa = await openPreset(page, preset, 'horizontal', {text: LONG_EN, secondaryText: LONG_EN_2, direction: 'ltr'});
      expectClean(qa, `${preset}/en`);
      for (const block of qa.blocks.filter((item) => /every|longer/i.test(item.text))) expect(block.direction).toBe('ltr');
    });

    const vertical = VERTICAL_BASELINES.includes(preset);
    test(`matches the accepted visual baseline${vertical ? 's (16:9 and 9:16)' : ' (16:9)'}`, async ({page}) => {
      for (const format of vertical ? ['horizontal', 'vertical'] : ['horizontal']) {
        await openPreset(page, preset, format);
        await expect(page.locator('#qa-stage')).toHaveScreenshot(`Preset-${preset}-${format}.png`);
      }
    });
  });
}

test.describe('invalid configuration is handled, not crashed', () => {
  test('empty copy renders no text blocks and no errors', async ({page}) => {
    const qa = await openPreset(page, 'title-orbit', 'horizontal', {text: '', secondaryText: ''});
    expect(qa.error).toBeUndefined();
    expect(qa.issues).toEqual([]);
    expect(qa.blocks).toEqual([]);
  });

  test('unknown typeface, direction, and accent fall back predictably', async ({page}) => {
    const qa = await openPreset(page, 'kinetic-stack', 'horizontal', {text: 'ركّز دلوقتي', typeface: 'serif', direction: 'sideways', accent: 'not a colour!'});
    expectClean(qa, 'sanitised');
    expect(qa.blocks[0].direction).toBe('rtl');
    expect(qa.blocks[0].fontFamily).toBe('ABUD Cairo');
  });

  test('a word too long for any size is reported as overflow instead of clipped silently', async ({page}) => {
    const qa = await openPreset(page, 'camera-parallax', 'vertical', {text: 'Supercalifragilisticexpialidocious'.repeat(3)});
    expect(qa.error).toBeUndefined();
    expect(qa.issues.some((issue) => issue.kind === 'fit-overflow')).toBe(true);
  });
});
