import {fontFamilies} from './fonts';
import {canvasMeasurer} from './measure';

// In-browser typography checks used by the QA fixtures. They run inside Studio, the Player, and
// renderStill(), and report problems a TypeScript check cannot see.

export type TypographyIssue = {
  kind: 'font-not-loaded' | 'glyph-fallback' | 'overflow' | 'outside-safe-area' | 'fit-overflow';
  detail: string;
};

const GENERIC_PROBES = ['monospace', 'serif', 'cursive'] as const;

/**
 * Detects glyphs the bundled family cannot draw. With full coverage the width is identical no
 * matter which generic font follows it in the stack; any fallback glyph makes the widths differ.
 */
export const hasGlyphFallback = (text: string, family: string, weight: number, size = 48) => {
  const widths = GENERIC_PROBES.map((generic) =>
    canvasMeasurer(text, {family: `"${family}", ${generic}`, weight, size}),
  );
  return widths.some((width) => Math.abs(width - widths[0]) > 0.01);
};

export const unloadedProjectFaces = () => {
  if (typeof document === 'undefined' || !('fonts' in document)) return [];
  const families = new Set(fontFamilies.map((family) => family.family));
  const problems: string[] = [];
  document.fonts.forEach((face) => {
    const family = face.family.replace(/^["']|["']$/g, '');
    if (families.has(family) && face.status !== 'loaded') problems.push(`${family} ${face.weight} (${face.status})`);
  });
  return problems;
};

/**
 * Audits every element marked with data-qa-text inside `root`: no scroll overflow, every box
 * inside `bounds`, no fitted block reporting overflow, and no glyph fallback for its copy.
 */
export const auditTypography = (root: HTMLElement, bounds: DOMRect): TypographyIssue[] => {
  const issues: TypographyIssue[] = unloadedProjectFaces().map((detail) => ({kind: 'font-not-loaded', detail}));
  root.querySelectorAll<HTMLElement>('[data-qa-text]').forEach((element) => {
    const label = element.dataset.qaText ?? 'text';
    if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
      issues.push({kind: 'overflow', detail: `${label}: content ${element.scrollWidth}×${element.scrollHeight} exceeds box ${element.clientWidth}×${element.clientHeight}`});
    }
    const rect = element.getBoundingClientRect();
    // scrollWidth ignores overflow past the inline-start edge in RTL, so compare the text's own
    // layout box with the element on both sides as well.
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    if (text.width > 0 && (text.left < rect.left - 1 || text.right > rect.right + 1)) {
      issues.push({kind: 'overflow', detail: `${label}: text spans ${Math.round(text.left)}–${Math.round(text.right)} outside ${Math.round(rect.left)}–${Math.round(rect.right)}`});
    }
    if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) {
      issues.push({kind: 'outside-safe-area', detail: `${label}: box leaves the safe area`});
    }
    element.querySelectorAll<HTMLElement>('[data-typography-fit="overflow"]').forEach(() => {
      issues.push({kind: 'fit-overflow', detail: `${label}: copy does not fit even at the minimum size`});
    });
    const sample = element.textContent ?? '';
    const family = element.dataset.qaFamily;
    const weight = Number(element.dataset.qaWeight ?? 400);
    if (family && sample.trim() && hasGlyphFallback(sample, family, weight)) {
      issues.push({kind: 'glyph-fallback', detail: `${label}: ${family} ${weight} is missing glyphs`});
    }
  });
  return issues;
};

export type FittedBlockReport = {
  text: string;
  fit: string;
  direction: string;
  fontSize: number;
  fontFamily: string;
  insideCanvas: boolean;
  insideSafeArea: boolean;
};

/**
 * Reports every fitted text block (any element with data-typography-fit) inside `root`: its fit
 * state, direction, font, and whether its text stays inside the canvas and the title-safe area.
 * Used for presets, which have no per-card QA markers. Fallback glyphs count as issues.
 */
export const auditFittedBlocks = (root: HTMLElement, canvas: DOMRect, safe: DOMRect) => {
  const issues: TypographyIssue[] = unloadedProjectFaces().map((detail) => ({kind: 'font-not-loaded' as const, detail}));
  const inside = (rect: DOMRect, bounds: DOMRect) =>
    rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
  const blocks: FittedBlockReport[] = Array.from(root.querySelectorAll<HTMLElement>('[data-typography-fit]')).map((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    const style = getComputedStyle(element);
    const family = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const text = element.textContent ?? '';
    const report = {
      text,
      fit: element.dataset.typographyFit ?? '',
      direction: element.getAttribute('dir') ?? style.direction,
      fontSize: Number.parseFloat(style.fontSize) || 0,
      fontFamily: family,
      insideCanvas: rect.width === 0 || inside(rect, canvas),
      insideSafeArea: rect.width === 0 || inside(rect, safe),
    };
    if (report.fit !== 'ok') issues.push({kind: 'fit-overflow', detail: `"${text.slice(0, 40)}" fit=${report.fit}`});
    if (!report.insideCanvas) issues.push({kind: 'overflow', detail: `"${text.slice(0, 40)}" leaves the canvas`});
    if (text.trim() && hasGlyphFallback(text, family, Number(style.fontWeight) || 400)) {
      issues.push({kind: 'glyph-fallback', detail: `"${text.slice(0, 40)}" uses fallback glyphs`});
    }
    return report;
  });
  return {issues, blocks};
};
