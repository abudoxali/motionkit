import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

// Structural browser coverage for the 12 style scene templates (4 styles × 3 roles), rendered
// through /qa.html at native composition sizes in all three formats with real fonts. Checks: fonts
// load, every fitted block fits, text stays inside the canvas and the title-safe area, no fallback
// glyphs, direction follows the copy, and a frame renders identically every time it is shown.
// No pixel baselines: style-scene appearance still awaits owner review.

const STYLES = ['plotter', 'doodle', 'whiteboard', 'chalkboard'] as const;
const ROLES = ['title', 'explainer', 'end-card'] as const;
const FORMATS = ['horizontal', 'vertical', 'square'] as const;

const COPY = {
  arabicLong: {
    text: 'كل فكرة كبيرة بتبدأ بخطوة صغيرة وكل خطوة محتاجة تركيز حقيقي على الأهم',
    secondaryText: 'جرّب نص أطول من المعتاد عشان نتأكد إن التصميم بيستوعبه من غير ما يتقص أو يخرج برة الإطار',
  },
  englishLong: {
    text: 'Every big idea starts with one small deliberate step toward what matters',
    secondaryText: 'A longer supporting line checks that the layout absorbs extra copy without clipping or leaving the frame',
  },
  // Opens with a Latin name but is Arabic copy: the layout must stay RTL.
  mixed: {text: 'ABUD Motion Studio بيخلّي الفكرة تتحرك في 30 ثانية', secondaryText: 'صدّر MP4 بدقة 4K من Remotion Studio بنفسك'},
} as const;

type Block = {text: string; fit: string; direction: string; fontFamily: string; insideCanvas: boolean; insideSafeArea: boolean};
type Qa = {status: string; target: string; fontState: string; issues: {kind: string; detail: string}[]; blocks: Block[]; error?: string};

const openScene = async (page: Page, style: string, role: string, format: string, props?: Record<string, unknown>, frame?: number) => {
  const query = new URLSearchParams({style, role, format, scale: '0.5'});
  if (props) query.set('props', JSON.stringify(props));
  if (frame !== undefined) query.set('frame', String(frame));
  await page.goto(`/qa.html?${query}`);
  await page.waitForFunction(() => window.__qa?.status === 'ready' || window.__qa?.status === 'error');
  return (await page.evaluate(() => window.__qa)) as Qa;
};

/** Shows another frame on the already-open scene and returns its audit. */
const showFrame = async (page: Page, frame: number) => {
  await page.evaluate((next) => window.__qaSetFrame!(next), frame);
  await page.waitForFunction((next) => window.__qa?.frame === next && (window.__qa.status === 'ready' || window.__qa.status === 'error'), frame);
  return (await page.evaluate(() => window.__qa)) as Qa;
};

/** Every third frame of the 120-frame preview, plus the last frame. */
const SWEEP = [...Array.from({length: 40}, (_, index) => index * 3), 119];

const expectClean = (qa: Qa, label: string, safeArea = true) => {
  expect(qa.error, label).toBeUndefined();
  expect(qa.fontState, label).toBe('ready');
  expect(qa.issues, label).toEqual([]);
  expect(qa.blocks.length, label).toBeGreaterThan(0);
  for (const block of qa.blocks) {
    expect(block.fit, `${label}: ${block.text}`).toBe('ok');
    expect(block.fontFamily, `${label}: ${block.text}`).toMatch(/^ABUD /);
    expect(block.insideCanvas, `${label}: "${block.text.slice(0, 30)}" leaves the canvas`).toBe(true);
    if (safeArea) expect(block.insideSafeArea, `${label}: "${block.text.slice(0, 30)}" outside the title-safe area`).toBe(true);
  }
};

let consoleErrors: string[] = [];

test.beforeEach(({page}) => {
  consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
});

test.afterEach(() => {
  // Invalid SVG attributes (e.g. a negative radius mid-animation) surface only as console errors.
  expect(consoleErrors).toEqual([]);
});

test('the harness knows the four styles and three roles', async ({page}) => {
  for (const style of STYLES) for (const role of ROLES) {
    expect((await openScene(page, style, role, 'square')).target).toBe(`Style-${style}-${role}-square`);
  }
  expect((await openScene(page, 'neon', 'title', 'square')).error).toMatch(/Unknown style/);
  expect((await openScene(page, 'plotter', 'outro', 'square')).error).toMatch(/Unknown style role/);
});

test('every entrance has finished by the settled poster frame the library opens on', async ({page}) => {
  // Doodle keeps ambient motion (sun, cloud, wave), so only the other styles can be compared
  // pixel for pixel; doodle's walks end at 2.3 s, before frame 90 at 30 fps.
  for (const style of STYLES.filter((id) => id !== 'doodle')) for (const role of ROLES) {
    await openScene(page, style, role, 'horizontal', undefined, 90);
    const settled = await page.locator('#qa-stage').screenshot();
    await openScene(page, style, role, 'horizontal', undefined, 119);
    expect((await page.locator('#qa-stage').screenshot()).equals(settled), `${style}/${role} still moving after frame 90`).toBe(true);
  }
});

for (const style of STYLES) {
  test.describe(style, () => {
    test('every role fits default copy in every format', async ({page}) => {
      for (const role of ROLES) for (const format of FORMATS) {
        const qa = await openScene(page, style, role, format);
        expectClean(qa, `${style}/${role}/${format}`);
        for (const block of qa.blocks) expect(block.direction, block.text).toBe('rtl');
      }
    });

    test('long Arabic, long English, and mixed copy fit every role in every format', async ({page}) => {
      for (const [name, copy] of Object.entries(COPY)) for (const role of ROLES) for (const format of FORMATS) {
        const qa = await openScene(page, style, role, format, copy);
        expectClean(qa, `${style}/${role}/${format}/${name}`);
        const headline = qa.blocks.find((block) => block.text.startsWith(copy.text.slice(0, 4)));
        expect(headline?.direction, `${style}/${role}/${format}/${name}`).toBe(name === 'englishLong' ? 'ltr' : 'rtl');
      }
    });

    test('a frame sweep in every format renders fitted, on-canvas text with no console errors', async ({page}) => {
      // 3 roles × 3 formats × 41 frames on one page each; about a minute per style on Windows.
      test.setTimeout(240_000);
      // Console errors (e.g. invalid SVG attributes mid-animation) fail the test in afterEach.
      for (const role of ROLES) for (const format of FORMATS) {
        await openScene(page, style, role, format, undefined, 0);
        for (const frame of SWEEP) {
          // Entrances may pass through the safe-area margin while they land; after frame 45 they may not.
          expectClean(await showFrame(page, frame), `${style}/${role}/${format}@${frame}`, frame >= 45);
        }
      }
    });

    test('entrance frames render without errors and the same frame renders identically', async ({page}) => {
      for (const role of ROLES) {
        for (const frame of [0, 8, 20, 45]) {
          // Entrance motion may move text slightly while it lands; it must still fit and stay on canvas.
          expectClean(await openScene(page, style, role, 'vertical', undefined, frame), `${style}/${role}@${frame}`, frame >= 45);
        }
        await openScene(page, style, role, 'horizontal', undefined, 20);
        const first = await page.locator('#qa-stage').screenshot();
        await openScene(page, style, role, 'horizontal', undefined, 20);
        expect((await page.locator('#qa-stage').screenshot()).equals(first), `${style}/${role} frame 20 is deterministic`).toBe(true);
      }
    });
  });
}
