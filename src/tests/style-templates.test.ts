import {describe, expect, it} from 'vitest';
import {STYLE_IDS} from '../projects/contract';
import {planScaffold} from '../projects/scaffold';
import {canvasMetrics} from '../motion/core/layout';
import {compositionFormats} from '../motion/formats';
import {STYLE_SCENE_ROLES, getStyleTheme, styleSceneLayout, styleSceneRoleFor, styleThemes} from '../motion/styles/templates';
import type {SceneRect} from '../motion/styles/templates';
import {detectDirection, dominantDirection, lineHeightFor} from '../motion/typography';

// Canvases the scenes must work on: the three composition formats plus the library's 960×540
// 16:9 preview, which is where the Pass 04 headline overflow appeared.
const CANVASES = [...Object.values(compositionFormats), {width: 960, height: 540}];
/** Cairo's measured content height (ascent + descent) in ems, from the browser at 56px. */
const CAIRO_EXTENT = 1.875;

const inside = (inner: SceneRect, outer: SceneRect) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
const overlaps = (a: SceneRect, b: SceneRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('style scene system', () => {
  it('defines one distinct visual language for each canonical style', () => {
    expect(STYLE_SCENE_ROLES).toEqual(['title', 'explainer', 'end-card']);
    expect(Object.keys(styleThemes).sort()).toEqual([...STYLE_IDS].sort());
    expect(new Set(STYLE_IDS.map((id) => getStyleTheme(id).movement)).size).toBe(4);
    for (const id of STYLE_IDS) {
      const theme = getStyleTheme(id);
      expect(theme.background).toMatch(/^#[\da-f]{6}$/i);
      expect(theme.foreground).toMatch(/^#[\da-f]{6}$/i);
      expect(theme.accent).toMatch(/^#[\da-f]{6}$/i);
    }
    expect(() => getStyleTheme('unknown' as never)).toThrow(/Unknown style/);
  });

  it('keeps text and drawing inside the title-safe area without colliding, for every style, role, canvas, and direction', () => {
    for (const {width, height} of CANVASES) {
      const {safeRect} = canvasMetrics(width, height);
      for (const id of STYLE_IDS) for (const role of STYLE_SCENE_ROLES) for (const direction of ['rtl', 'ltr'] as const) {
        const label = `${id}/${role}/${width}x${height}/${direction}`;
        const layout = styleSceneLayout(id, role, width, height, direction);
        expect(inside(layout.text, safeRect), label).toBe(true);
        expect(inside(layout.art, safeRect), label).toBe(true);
        // A boxed end card frames its text on purpose; every other arrangement keeps them apart.
        if (layout.arrangement === 'boxed') expect(inside(layout.text, layout.art), label).toBe(true);
        else expect(overlaps(layout.text, layout.art), label).toBe(false);
        expect(layout.headline.boxHeight + layout.gap + layout.supporting.boxHeight, label).toBeLessThanOrEqual(layout.text.height);
      }
    }
  });

  it('fits one headline line at the minimum size in every headline box (the Pass 04 overflow)', () => {
    // A fitted Cairo line at size s is s × extent tall once the mark overhang is reserved. The old
    // template sized its box from the safe area but its minimum font from an absolute 56px floor,
    // so in the library's 960×540 preview the 104px box could not hold one 105px line.
    for (const {width, height} of CANVASES) for (const id of STYLE_IDS) for (const role of STYLE_SCENE_ROLES) {
      const {headline, supporting} = styleSceneLayout(id, role, width, height, 'rtl');
      const label = `${id}/${role}/${width}x${height}`;
      expect(headline.minSize, label).toBeLessThan(headline.maxSize);
      expect(headline.boxHeight, label).toBeGreaterThanOrEqual(Math.ceil(headline.minSize * CAIRO_EXTENT * 2));
      expect(supporting.boxHeight, label).toBeGreaterThanOrEqual(Math.ceil(supporting.minSize * lineHeightFor('rtl', 'body') * 2));
    }
  });

  it('scales the layout with the canvas, so the half-size library preview matches the composition', () => {
    for (const id of STYLE_IDS) for (const role of STYLE_SCENE_ROLES) {
      const full = styleSceneLayout(id, role, 1920, 1080, 'rtl');
      const half = styleSceneLayout(id, role, 960, 540, 'rtl');
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(full.text[key] / 2 - half.text[key]), `${id}/${role} text.${key}`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(full.art[key] / 2 - half.art[key]), `${id}/${role} art.${key}`).toBeLessThanOrEqual(1.5);
      }
      expect(half.headline.minSize).toBeCloseTo(full.headline.minSize / 2, 0);
      expect(half.headline.maxSize).toBeCloseTo(full.headline.maxSize / 2, 0);
    }
  });

  it('puts text on the reading-start side and gives each style its own arrangement', () => {
    const {width, height} = compositionFormats.horizontal;
    const rtl = styleSceneLayout('plotter', 'title', width, height, 'rtl');
    const ltr = styleSceneLayout('plotter', 'title', width, height, 'ltr');
    expect(rtl.text.x).toBeGreaterThan(rtl.art.x);
    expect(ltr.text.x).toBeLessThan(ltr.art.x);
    // Roles differ within a style, and styles differ for the same role.
    expect(new Set(STYLE_SCENE_ROLES.map((role) => styleSceneLayout('plotter', role, width, height, 'rtl').arrangement)).size).toBe(3);
    expect(styleSceneLayout('doodle', 'title', width, height, 'rtl').arrangement).toBe('top');
    expect(styleSceneLayout('chalkboard', 'end-card', width, height, 'rtl').arrangement).toBe('boxed');
    expect(styleSceneLayout('whiteboard', 'end-card', width, height, 'rtl').align).toBe('center');
    expect(() => styleSceneLayout('plotter', 'outro' as never, width, height, 'rtl')).toThrow(/Unknown style scene role/);
  });

  it('chooses the layout direction from the dominant script, not the first letter', () => {
    const mixed = 'ABUD Motion Studio بيخلّي الفكرة تتحرك في 30 ثانية';
    expect(detectDirection(mixed)).toBe('ltr');
    expect(dominantDirection(mixed)).toBe('rtl');
    expect(dominantDirection('Export the MP4 from Studio بنفسك')).toBe('ltr');
    expect(dominantDirection('30%', 'rtl')).toBe('rtl');
    // A tie is the caller's call: the studio and its scenes are Arabic-first.
    expect(dominantDirection('ABUD Motion Studio بيخلّي الفكرة تتحرك', 'rtl')).toBe('rtl');
    expect(dominantDirection('AB اب')).toBe('ltr');
    expect(dominantDirection('AB اب', 'rtl')).toBe('rtl');
  });

  it('maps timeline positions to scene roles', () => {
    expect(styleSceneRoleFor(0, 1)).toBe('title');
    expect([0, 1, 2].map((index) => styleSceneRoleFor(index, 3))).toEqual(['title', 'explainer', 'end-card']);
    expect([0, 1, 2, 3].map((index) => styleSceneRoleFor(index, 4))).toEqual(['title', 'explainer', 'explainer', 'end-card']);
  });

  it('generates a real style component for each named style without affecting custom scaffolds', () => {
    for (const id of STYLE_IDS) {
      const plan = planScaffold({id: `test-${id}-reel`, styleId: id, language: 'ar', formats: ['vertical', 'square']});
      const code = plan.files.find((file) => file.path.endsWith('Composition.tsx'))!.content;
      const metadata = plan.files.find((file) => file.path.endsWith('project.ts'))!.content;
      expect(code).toContain("import {StyleScene, getStyleTheme, styleSceneRoleFor} from '../../motion/styles/templates';");
      expect(code).toContain(`<StyleScene styleId={"${id}"} role={role}`);
      expect(code).toContain('styleSceneRoleFor(index, timeline.length)');
      expect(code).toContain('<SceneTimeline');
      expect(code).toContain('"الخلاصة"');
      expect(code).not.toContain('SceneCopy');
      expect(metadata).toContain(`styleId: "${id}"`);
      expect(plan.compositionIds).toHaveLength(2);
    }

    const custom = planScaffold({id: 'custom-motion-test', styleId: 'custom'});
    const component = custom.files.find((file) => file.path.endsWith('Composition.tsx'))!.content;
    expect(component).not.toContain('StyleScene');
    expect(component).toContain('<SceneCopy');
  });

  it('uses English placeholder scene copy when an English project is requested', () => {
    const plan = planScaffold({id: 'english-style-test', styleId: 'plotter', language: 'en'});
    const code = plan.files.find((file) => file.path.endsWith('Composition.tsx'))!.content;
    expect(code).toContain('"Key takeaway"');
    expect(code).toContain('"Main idea"');
    expect(code).toContain('direction={englishStyleTestMeta.direction}');
  });
});
