import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

// Two independent checks per typography fixture:
//  1. Structural: bundled fonts loaded, no overflow, inside the safe area, no glyph fallback,
//     plus explicit bidi-order assertions for the edge cases below.
//  2. Visual: pixel comparison against reviewed baselines in e2e/baselines/. A pass only means
//     "unchanged since the accepted baseline" — it says nothing about artistic quality.

const SHEETS = ['Specimens', 'Motion', 'Bidi'] as const;
const FORMATS = ['Horizontal', 'Vertical', 'Square'] as const;

type Qa = {status: string; fontState: string; issues: {kind: string; detail: string}[]; error?: string};

const openFixture = async (page: Page, composition: string) => {
  await page.goto(`/qa.html?composition=${composition}&scale=0.5`);
  await page.waitForFunction(() => window.__qa?.status === 'ready' || window.__qa?.status === 'error');
  return (await page.evaluate(() => window.__qa)) as Qa;
};

/** Screen rectangle of the first occurrence of `needle` inside a fixture card, after `after`. */
const rectOf = (page: Page, card: string, needle: string, after = '') =>
  page.evaluate(
    ({card, needle, after}) => {
      const root = document.querySelector(`[data-qa-text="${card}"]`);
      if (!root) throw new Error(`card ${card} not found`);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const full: {node: Text; start: number}[] = [];
      let text = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        full.push({node: node as Text, start: text.length});
        text += node.textContent;
      }
      const index = text.indexOf(needle, after ? text.indexOf(after) : 0);
      if (index < 0) throw new Error(`"${needle}" not found in ${card}: ${text}`);
      const locate = (offset: number) => {
        const entry = [...full].reverse().find((item) => item.start <= offset)!;
        return {node: entry.node, offset: offset - entry.start};
      };
      const range = document.createRange();
      const start = locate(index);
      const end = locate(index + needle.length);
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      return {left, right, lines: new Set(rects.map((rect) => Math.round(rect.top))).size};
    },
    {card, needle, after},
  );

for (const sheet of SHEETS) {
  for (const format of FORMATS) {
    const composition = `QA-Typography-${sheet}-${format}`;

    test(`${composition}: fonts, bounds, and safe area are structurally correct`, async ({page}) => {
      const qa = await openFixture(page, composition);
      expect(qa.error).toBeUndefined();
      expect(qa.fontState).toBe('ready');
      expect(qa.issues).toEqual([]);
      const fits = await page.locator('[data-typography-fit]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-typography-fit')));
      expect(fits.length).toBeGreaterThan(0);
      expect(fits.every((fit) => fit === 'ok')).toBe(true);
    });

    test(`${composition}: matches the accepted visual baseline`, async ({page}) => {
      await openFixture(page, composition);
      await expect(page.locator('#qa-stage')).toHaveScreenshot(`${composition}.png`);
    });
  }
}

test.describe('bidi edge cases (QA-Typography-Bidi-Vertical)', () => {
  test.beforeEach(async ({page}) => {
    const qa = await openFixture(page, 'QA-Typography-Bidi-Vertical');
    expect(qa.issues).toEqual([]);
  });

  // Unicode rule W2: Western digits that follow an Arabic letter resolve as Arabic numbers, so a
  // following % takes Arabic order exactly like ٪ — the sign sits to the left of the digits (%15).
  test('percent signs follow Arabic order in RTL copy for both numeral systems', async ({page}) => {
    for (const [digits, sign, anchor] of [['15', '%', '15'], ['٢٠', '٪', '٢٠']]) {
      const number = await rectOf(page, 'percent', digits);
      const symbol = await rectOf(page, 'percent', sign, anchor);
      expect(number.left, `${digits}${sign}`).toBeGreaterThanOrEqual(symbol.right - 1);
    }
    const before = await rectOf(page, 'percent', 'خصم');
    const number = await rectOf(page, 'percent', '15');
    const after = await rectOf(page, 'percent', 'على');
    const sign = await rectOf(page, 'percent', '%');
    expect(before.left).toBeGreaterThanOrEqual(number.right - 1);
    expect(sign.left).toBeGreaterThanOrEqual(after.right - 1);
  });

  test('Latin identifiers keep their digits and dots in one left-to-right run', async ({page}) => {
    const isolated = await page.locator('[data-qa-text="identifiers"] bdi').allTextContents();
    expect(isolated).toEqual(expect.arrayContaining(['MP4', 'H.264', '4K', 'YouTube']));
    for (const [word, first, last] of [['MP4', 'M', '4'], ['H.264', 'H', '264'], ['4K', '4', 'K'], ['YouTube', 'Y', 'be']]) {
      const head = await rectOf(page, 'identifiers', first, word);
      const tail = await rectOf(page, 'identifiers', last, word);
      expect(tail.left, word).toBeGreaterThanOrEqual(head.right - 1);
    }
  });

  test('numbers keep digit order in both systems and RTL order between numbers', async ({page}) => {
    for (const number of ['2026', '٢٠٢٦']) {
      const head = await rectOf(page, 'numerals', number[0], number);
      const tail = await rectOf(page, 'numerals', number[3], number);
      expect(tail.left, number).toBeGreaterThan(head.left);
    }
    const episode = await rectOf(page, 'numerals', '12');
    const year = await rectOf(page, 'numerals', '2026');
    expect(episode.left).toBeGreaterThanOrEqual(year.right - 1);
  });

  test('mixed-direction copy wraps between words and keeps short Latin names on one line', async ({page}) => {
    const lines = await page.locator('[data-qa-text="mixed-wrap"] [data-typography-fit] > div').count();
    expect(lines).toBeGreaterThanOrEqual(2);
    for (const term of ['Remotion Studio', 'Focus Doodle', 'preview', 'export']) {
      expect((await rectOf(page, 'mixed-wrap', term)).lines, term).toBe(1);
    }
  });
});

test('HighlightedPhrase marks consecutive words as one continuous stroke', async ({page}) => {
  await openFixture(page, 'QA-Typography-Motion-Horizontal');
  const marks = await page.locator('[data-qa-text="highlight"] span[aria-hidden]').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()).map((rect) => ({left: rect.left, right: rect.right, top: Math.round(rect.top)})),
  );
  expect(marks.length).toBe(2);
  const [a, b] = [...marks].sort((x, y) => x.left - y.left);
  expect(a.top).toBe(b.top);
  expect(b.left - a.right).toBeLessThanOrEqual(1);
});

test('a failed font load is reported, never silently replaced', async ({page}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/fonts/**', (route) => route.fulfill({status: 404, body: ''}));
  const qa = await openFixture(page, 'QA-Typography-Specimens-Square');
  expect(qa.fontState).toBe('failed');
  expect(qa.issues.some((issue) => issue.kind === 'font-not-loaded')).toBe(true);
  expect(errors.some((text) => text.includes('Project fonts failed to load'))).toBe(true);
});
