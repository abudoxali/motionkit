import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

// Owner-media components in real Chromium through the QA harness, with synthetic media imported by
// the real importer (npm run qa:media, run by global setup). Assertions read facts from the DOM.

const manifestFile = path.resolve('public/user-assets/qa-media/assets.json');
test.skip(!existsSync(manifestFile), 'QA media not generated (FFmpeg missing); run npm run qa:media');

const timingMethod = () => {
  const file = path.resolve('public/user-assets/qa-media/timing/voiceover.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as {method: string}).method : 'none';
};

const FORMATS = ['Horizontal', 'Vertical', 'Square'] as const;
type Format = (typeof FORMATS)[number];

let errors: string[] = [];
test.beforeEach(({page}) => {
  errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

const open = async (page: Page, format: Format, frame: number, props?: Record<string, unknown>) => {
  const query = `composition=QA-Media-${format}&scale=0.5&frame=${frame}${props ? `&props=${encodeURIComponent(JSON.stringify(props))}` : ''}`;
  await page.goto(`/qa.html?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-qa-status', 'ready');
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
};

for (const format of FORMATS) {
  test(`every scene draws imported media without distortion (${format})`, async ({page}) => {
    for (const frame of [0, 60, 105, 160, 250, 299]) {
      await open(page, format, frame);
      expect(await page.locator('[data-missing-asset]').count(), `frame ${frame}`).toBe(0);
      const images = await page.locator('#qa-stage img').evaluateAll((nodes) =>
        nodes.map((node) => {
          const image = node as HTMLImageElement;
          return {natural: image.naturalWidth / image.naturalHeight, drawn: image.offsetWidth / image.offsetHeight, src: image.getAttribute('src') ?? ''};
        }),
      );
      expect(images.length, `frame ${frame}`).toBeGreaterThan(0);
      for (const image of images) {
        expect(image.src).toContain('user-assets/qa-media/');
        expect(Math.abs(image.drawn / image.natural - 1), `${image.src} at ${frame}`).toBeLessThan(0.01);
      }
    }
  });
}

test('scene boundaries, pose switching, and rig nesting', async ({page}) => {
  const visibleScenes = () =>
    page.locator('[data-scene]').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).visibility === 'visible').map((node) => node.getAttribute('data-scene')));
  await open(page, 'Horizontal', 50);
  expect(await visibleScenes()).toEqual(['desktop']);
  await open(page, 'Horizontal', 105);
  expect(await visibleScenes()).toEqual(['desktop', 'phone']);
  await open(page, 'Horizontal', 299);
  expect(await visibleScenes()).toEqual(['characters']);
  // The characters scene starts at 200; pose B takes over at its local frame 45.
  await open(page, 'Horizontal', 240);
  await expect(page.locator('[data-character="hero-pose-a"]')).toHaveCount(1);
  await open(page, 'Horizontal', 250);
  await expect(page.locator('[data-character="hero-pose-b"]')).toHaveCount(1);
  expect(await page.locator('[data-layer="torso"] [data-layer="head"]').count()).toBe(1);
  expect(await page.locator('[data-layer="torso"] [data-layer="arm-front"]').count()).toBe(1);
});

test('captions follow the voiceover timing inside the safe area', async ({page}) => {
  await open(page, 'Horizontal', 5);
  await expect(page.locator('[data-caption]')).toHaveCount(0);
  await open(page, 'Horizontal', 60);
  const caption = page.locator('[data-caption]');
  await expect(caption).toHaveAttribute('data-caption', 'Import the voiceover first.');
  await expect(caption).toHaveAttribute('data-caption-mode', timingMethod() === 'forced-alignment' ? 'word' : 'sentence');
  await expect(caption.locator('[data-typography-fit]')).toHaveAttribute('data-typography-fit', 'ok');
  const [stage, box] = await Promise.all([page.locator('#qa-stage').boundingBox(), caption.boundingBox()]);
  // The title-safe area is inset 5% on each side.
  expect(box!.y + box!.height).toBeLessThanOrEqual(stage!.y + stage!.height * 0.95 + 1);
  expect(box!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width * 0.05 - 1);
  await open(page, 'Horizontal', 15 + Math.round(3.4 * 30));
  await expect(page.locator('[data-caption]')).toHaveAttribute('data-caption', 'Screenshots keep their real content.');
});

test('mixed Arabic and English captions stay RTL with whole words', async ({page}) => {
  for (const format of ['Horizontal', 'Vertical'] as const) {
    await open(page, format, 15 + 30, {captionVoiceover: 'voiceover-mixed'});
    const caption = page.locator('[data-caption]');
    await expect(caption).toHaveAttribute('data-caption', 'جرّب ABUD Motion Studio دلوقتي');
    await expect(caption).toHaveAttribute('data-caption-mode', 'word');
    const fitted = caption.locator('[data-typography-fit]');
    await expect(fitted).toHaveAttribute('dir', 'rtl');
    await expect(fitted).toHaveAttribute('data-typography-fit', 'ok');
    const text = (await fitted.innerText()).replace(/\s+/g, ' ').trim();
    for (const word of ['جرّب', 'ABUD', 'Motion', 'Studio', 'دلوقتي']) expect(text).toContain(word);
  }
  await open(page, 'Square', 15 + 90, {captionVoiceover: 'voiceover-mixed'});
  await expect(page.locator('[data-caption]')).toHaveAttribute('data-caption', 'الصوت بيحدد التوقيت 100%');
});

test('a missing asset is shown explicitly, never substituted', async ({page}) => {
  await open(page, 'Horizontal', 60, {captionVoiceover: 'not-imported'});
  const missing = page.locator('[data-missing-asset]');
  await expect(missing).toHaveCount(1);
  await expect(missing).toHaveAttribute('data-missing-asset', /"not-imported" is not imported in project "qa-media"/);
  await expect(page.locator('[data-caption]')).toHaveCount(0);
});

// Determinism is checked on the rendered DOM (every element, style, and attribute value),
// visiting other frames in between. Raster pixels are not compared here: Chromium's GPU blur of
// the large device shadows dithers by one level under parallel load (measured PSNR ≈ 60 dB, only
// inside shadow tiles), which is not a property of the composition.
test('frames are deterministic', async ({page}) => {
  // Canonical form: attribute and inline-style order depend on when React first created an element
  // (before or after the fonts loaded), so both are sorted; every value must still match.
  const snapshot = () =>
    page.locator('#qa-stage').evaluate((root) => {
      const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
        if (!(node instanceof Element)) return '';
        const value = (item: Attr) => (item.name === 'style' ? item.value.split(';').map((rule) => rule.trim()).filter(Boolean).sort().join('; ') : item.value);
        const attributes = [...node.attributes].map((item) => `${item.name}="${value(item)}"`).sort().join(' ');
        return `<${node.tagName.toLowerCase()} ${attributes}>${[...node.childNodes].map(walk).join('')}</>`;
      };
      return walk(root);
    });
  for (const format of FORMATS) {
    await open(page, format, 137);
    const first = await snapshot();
    await open(page, format, 20);
    await open(page, format, 250);
    await open(page, format, 137);
    const second = await snapshot();
    // On a mismatch, report only where the two frames differ.
    let at = 0;
    while (at < first.length && first[at] === second[at]) at += 1;
    expect(second.slice(Math.max(0, at - 160), at + 160), `${format}: differs at ${at}`).toBe(first.slice(Math.max(0, at - 160), at + 160));
  }
});
