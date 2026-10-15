import {existsSync} from 'node:fs';
import path from 'node:path';
import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {STUDIO_URL_UNDER_TEST} from '../playwright.config';

// Real user workflows in the local library, run at desktop (1440×900) and mobile (375×812).
// Assertions read what the Remotion Player actually rendered, not just which control exists.

const player = (page: Page) => page.locator('.player-frame');

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 840;

/** Opens the catalog on mobile; on desktop it is always visible. */
const openCatalog = async (page: Page) => {
  if (!isMobile(page)) return;
  const toggle = page.getByRole('button', {name: /browse library/i});
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('.catalog-panel')).toBeVisible();
};

const choose = async (page: Page, name: RegExp | string) => {
  await openCatalog(page);
  await page.locator('.catalog-panel').getByRole('button', {name}).first().click();
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const {scrollWidth, innerWidth} = await page.evaluate(() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth}));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

const playerAspect = async (page: Page) => {
  // The Player root carries the aspect-ratio style set by PreviewPlayer.
  const box = (await page.locator('.player-frame [style*="aspect-ratio"]').first().boundingBox())!;
  return box.height / box.width;
};

let consoleErrors: string[] = [];

test.beforeEach(async ({page}) => {
  consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      // Ignore transient dev-server WebSocket / Windows socket exhaustion errors
      if (text.includes('ERR_NO_BUFFER_SPACE') || text.includes('WebSocket connection to')) return;
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'MotionKit'})).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('loads with the first style playing in the preview and every catalog section', async ({page}) => {
  await expect(player(page).getByText('PLOTTER')).toBeVisible();
  await openCatalog(page);
  for (const section of ['Productions', 'QA fixtures', 'Motion styles', 'Motion presets']) {
    await expect(page.locator('.catalog-panel').getByRole('heading', {name: section})).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
});

test('selects a style and a preset and renders each in the Player', async ({page}) => {
  await choose(page, /chalkboard proof/i);
  await expect(page.locator('.preview-toolbar h2')).toHaveText('Chalkboard Proof');
  await expect(player(page).getByText('a² + b² = c²')).toBeVisible();

  await choose(page, /count-up stat/i);
  await expect(page.locator('.preview-toolbar h2')).toHaveText('Count-up Stat');
  await expect(player(page).getByText('Frame accurate')).toBeVisible();
});

test('searches and filters presets and projects', async ({page}) => {
  await openCatalog(page);
  const catalog = page.locator('.catalog-panel');
  await catalog.getByLabel('Search library').fill('count');
  await expect(catalog.locator('.preset-button')).toHaveCount(1);
  await expect(catalog.locator('.preset-button')).toContainText('Count-up Stat');

  await catalog.getByLabel('Search library').fill('focus');
  await expect(catalog.locator('.production-card')).toHaveCount(1);
  await expect(catalog.locator('.production-card')).toContainText('Focus Doodle');

  await catalog.getByLabel('Search library').fill('');
  await catalog.getByRole('button', {name: 'Drawing', exact: true}).click();
  await expect(catalog.locator('.preset-button')).toHaveCount(2);
  await expect(catalog.locator('.preset-button span')).toHaveText(['Drawing', 'Drawing']);
});

test('edits text, accent, typeface, and direction and the Player follows', async ({page}) => {
  await choose(page, /kinetic stack/i);
  const dock = page.getByLabel('Live preset controls');

  await dock.getByLabel('Primary text').fill('ركّز في الشغل دلوقتي');
  await expect(player(page).getByText('دلوقتي', {exact: true})).toBeVisible();

  await dock.getByLabel('Accent color').fill('#ff3355');
  // KineticStack paints its second word in the accent colour.
  await expect(player(page).getByText('في', {exact: true})).toHaveCSS('color', 'rgb(255, 51, 85)');

  const canvasFont = () => player(page).locator('[style*="font-family"]').first().evaluate((node) => getComputedStyle(node).fontFamily);
  expect(await canvasFont()).toMatch(/^"ABUD Cairo"/);
  await dock.getByLabel('Typeface').selectOption('text');
  await expect.poll(canvasFont).toMatch(/^"ABUD Plex Arabic"/);

  const direction = dock.getByLabel('Text direction');
  await direction.selectOption('rtl');
  await expect(player(page).locator('[dir="rtl"]').first()).toBeVisible();
  await expect(dock.getByLabel('Primary text')).toHaveAttribute('dir', 'rtl');

  await direction.selectOption('ltr');
  await expect(player(page).locator('[dir="ltr"]').first()).toBeVisible();

  await direction.selectOption('auto');
  await expect(direction.locator('option:checked')).toHaveText(/RTL from text/);
  await dock.getByLabel('Primary text').fill('Ideas that move');
  await expect(direction.locator('option:checked')).toHaveText(/LTR from text/);
  await expect(player(page).locator('[dir="ltr"]').first()).toBeVisible();
  await expect(dock.getByLabel('Primary text')).toHaveAttribute('dir', 'ltr');
});

test('switches the preview between 16:9, 9:16, and 1:1', async ({page}) => {
  const ratios = page.getByLabel('Preview aspect ratio');
  expect(await playerAspect(page)).toBeCloseTo(9 / 16, 2);
  await ratios.getByRole('button', {name: '9:16'}).click();
  await expect(ratios.getByRole('button', {name: '9:16'})).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => playerAspect(page)).toBeCloseTo(16 / 9, 2);
  await ratios.getByRole('button', {name: '1:1'}).click();
  await expect.poll(() => playerAspect(page)).toBeCloseTo(1, 2);
  await expectNoHorizontalOverflow(page);
});

test('navigates to a production with its own formats, scenes, and Studio deep link', async ({page}) => {
  await choose(page, /focus doodle/i);
  await expect(page.locator('.preview-toolbar h2')).toHaveText('Focus Doodle');
  await expect(page.getByLabel('Preview aspect ratio').getByRole('button')).toHaveText(['9:16']);
  await expect.poll(() => playerAspect(page)).toBeCloseTo(16 / 9, 2);
  await expect(player(page).locator('svg').first()).toBeVisible();
  await expect(page.locator('.scene-list li')).toHaveCount(4);
  await expect(page.getByRole('link', {name: /review focus doodle in studio/i})).toHaveAttribute('href', `${STUDIO_URL_UNDER_TEST}/Focus-Doodle-Vertical`);

  await choose(page, /typography qa · bidi/i);
  await page.getByLabel('Preview aspect ratio').getByRole('button', {name: '1:1'}).click();
  await expect(page.getByRole('link', {name: /review typography qa/i})).toHaveAttribute('href', `${STUDIO_URL_UNDER_TEST}/QA-Typography-Bidi-Square`);
  await expect(player(page).getByText('YouTube', {exact: true})).toBeVisible();
});

test('points the topbar Studio link at the configured Studio URL', async ({page}) => {
  const link = page.getByRole('link', {name: /open remotion studio/i});
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', STUDIO_URL_UNDER_TEST);
  await expect(link).toHaveAttribute('target', '_blank');
});

test('catalog visibility follows the viewport', async ({page}) => {
  // The toggle's label flips between "Browse library" and "Close library".
  const toggle = page.locator('.catalog-toggle');
  if (!isMobile(page)) {
    await expect(toggle).toBeHidden();
    await expect(page.locator('.catalog-panel')).toBeVisible();
    return;
  }
  await expect(page.locator('.catalog-panel')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveText('Close library');
  await expect(page.locator('.catalog-panel')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.locator('.catalog-panel').getByRole('button', {name: /marker highlight/i}).click();
  await expect(page.locator('.catalog-panel')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveText('Browse library');
  await expect(player(page)).toBeInViewport();
  await expect(page.getByLabel('Live preset controls')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('every style role renders in the real Player with editable Arabic and English copy', async ({page}) => {
  const roles = ['title', 'explainer', 'end-card'];
  const styles = [
    [/plotter signal/i, 'plotter'],
    [/doodle journey/i, 'doodle'],
    [/whiteboard logic/i, 'whiteboard'],
    [/chalkboard proof/i, 'chalkboard'],
  ] as const;
  const roleSelector = page.getByRole('combobox', {name: 'Preview scene'});

  for (const [button, styleId] of styles) {
    await choose(page, button);
    const controls = page.getByLabel('Style scene template controls');
    await expect(controls).toBeVisible();
    for (const role of roles) {
      await roleSelector.selectOption(role);
      const stage = player(page).locator(`[data-style-template="${styleId}"][data-style-role="${role}"]`);
      await expect(stage).toBeVisible();
      const arabic = 'الفكرة تتحرك بوضوح';
      await controls.getByLabel('Scene headline').fill(arabic);
      await expect(stage).toContainText('الفكرة');
      await expect(stage.locator('[data-typography-fit="ok"]').first()).toBeAttached();
      const fits = await stage.locator('[data-typography-fit]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-typography-fit')),
      );
      expect(fits, `${styleId}/${role}`).not.toContain('overflow');
      expect(fits, `${styleId}/${role}`).not.toContain('pending');
      // The paused Player opens on the settled scene, so the edited headline is actually seen:
      // fully opaque and unmasked, not just present in the DOM mid-entrance.
      const shown = await stage.locator('[data-typography-fit]').first().evaluate((node) => {
        let opacity = 1;
        let masked = false;
        for (let element: Element | null = node; element; element = element.parentElement) {
          const style = getComputedStyle(element);
          opacity *= Number(style.opacity);
          masked ||= style.maskImage !== 'none' && style.maskImage !== '';
          if (element.hasAttribute('data-style-template')) break;
        }
        return {opacity, masked};
      });
      expect(shown, `${styleId}/${role}`).toEqual({opacity: 1, masked: false});
      await controls.getByLabel('Scene headline').fill('Make ideas move');
      await expect(stage).toContainText('Make');
      await expect(stage).toContainText('move');
      await expect(stage.locator('[dir="ltr"]').first()).toBeAttached();
    }
  }
  await page.getByLabel('Preview aspect ratio').getByRole('button', {name: '9:16'}).click();
  await expect.poll(() => playerAspect(page)).toBeCloseTo(16 / 9, 2);
  await expectNoHorizontalOverflow(page);
});

/** Width × height of the composition inside the Player (it scales the result for display). */
const compositionSize = (page: Page) =>
  player(page).locator('div[style*="transform: scale"]').first().evaluate((node) => {
    const style = (node as HTMLElement).style;
    return `${parseFloat(style.width)}x${parseFloat(style.height)}`;
  });

test('previews at the native composition size in every format, like Studio', async ({page}) => {
  await choose(page, /kinetic stack/i);
  expect(await compositionSize(page)).toBe('1920x1080');
  const ratios = page.getByLabel('Preview aspect ratio');
  await ratios.getByRole('button', {name: '9:16'}).click();
  await expect.poll(() => compositionSize(page)).toBe('1080x1920');
  await ratios.getByRole('button', {name: '1:1'}).click();
  await expect.poll(() => compositionSize(page)).toBe('1080x1080');
  await choose(page, /plotter signal/i);
  await page.getByRole('combobox', {name: 'Preview scene'}).selectOption('title');
  await ratios.getByRole('button', {name: '16:9'}).click();
  await expect.poll(() => compositionSize(page)).toBe('1920x1080');
});

test('shows a project\'s imported media, or says plainly that there is none', async ({page}) => {
  await choose(page, /focus doodle/i);
  const panel = page.getByLabel('Project media');
  await expect(panel).toContainText('No media imported for this project on this machine.');

  test.skip(!existsSync(path.resolve('public/user-assets/qa-media/assets.json')), 'QA media not generated (needs FFmpeg)');
  await choose(page, /media qa/i);
  for (const id of ['screen-desktop', 'screen-phone', 'hero-pose-a', 'rig-torso', 'voiceover', 'music-bed']) {
    await expect(panel.locator(`[data-asset-id="${id}"]`)).toBeVisible();
  }
  await expect(panel.locator('[data-asset-id="screen-desktop"]')).toContainText('1600×1000 png');
  await expect(panel.locator('[data-asset-id="voiceover"]')).toContainText(/timing: (forced-alignment|estimated)/);
  await expect(panel.locator('[data-asset-id="screen-desktop"]')).toContainText('Previewable');
  await expect(panel.getByLabel('Missing media')).toHaveCount(0);
  await expect(page.getByRole('link', {name: /review media qa/i})).toHaveAttribute('href', `${STUDIO_URL_UNDER_TEST}/QA-Media-Horizontal`);
  await expect(player(page).locator('img[src*="user-assets/qa-media/"]').first()).toBeAttached();
  await expectNoHorizontalOverflow(page);
});

test('plays the imported voiceover in the library Player', async ({page}) => {
  test.skip(!existsSync(path.resolve('public/user-assets/qa-media/assets.json')), 'QA media not generated (needs FFmpeg)');
  await choose(page, /media qa/i);
  await expect(player(page).locator('img[src*="user-assets/qa-media/"]').first()).toBeAttached();
  await player(page).hover();
  await player(page).getByRole('button', {name: /play/i}).first().click();
  // The voiceover starts at frame 15 (0.5 s); after playing it must be advancing.
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll('audio')].filter((audio) => audio.src.includes('/user-assets/qa-media/audio/voiceover.')).map((audio) => audio.currentTime)), {timeout: 10_000})
    .toEqual([expect.any(Number)]);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('audio')].find((audio) => audio.src.includes('/audio/voiceover.'))?.currentTime ?? 0), {timeout: 10_000}).toBeGreaterThan(0.3);
});

test('library preset previews lay out exactly like the native 1920×1080 composition', async ({page, browser}) => {
  test.skip(isMobile(page), 'layout parity is a property of the canvas, checked once on desktop');
  const presets = [
    ['kinetic-stack', /kinetic stack/i], ['title-orbit', /title orbit/i], ['lower-third-beam', /lower third beam/i],
    ['logo-prism-reveal', /prism reveal/i], ['marker-highlight', /marker highlight/i], ['word-cascade', /word cascade/i],
    ['hand-drawn-route', /hand-drawn route/i], ['whiteboard-explainer', /whiteboard explainer/i], ['camera-parallax', /camera parallax/i],
    ['count-up-stat', /count-up stat/i], ['shape-morph', /shape morph/i], ['social-promo', /social promo/i],
  ] as const;
  const sizes = (root: ReturnType<Page['locator']>) =>
    root.locator('[data-typography-fit]').evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute('data-typography-fit')}:${node.getAttribute('data-typography-size')}`).sort());
  const harness = await browser.newPage({viewport: {width: 1280, height: 1000}});
  for (const [id, name] of presets) {
    await choose(page, name);
    await expect(player(page).locator('[data-typography-fit="pending"]')).toHaveCount(0);
    await expect(player(page).locator('[data-typography-fit]').first()).toBeAttached();
    await harness.goto(`/qa.html?preset=${id}&format=horizontal&frame=0`);
    await expect(harness.locator('body')).toHaveAttribute('data-qa-status', 'ready');
    expect(await sizes(player(page)), id).toEqual(await sizes(harness.locator('#qa-stage')));
  }
  await harness.close();
});
