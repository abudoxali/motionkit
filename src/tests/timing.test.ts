import {describe, expect, it} from 'vitest';
import {clampedProgress, framesFromSeconds, normalizeArabic} from '../motion/timing';

describe('deterministic timing helpers', () => {
  it('converts seconds using the supplied frame rate', () => {
    expect(framesFromSeconds(2.5, 30)).toBe(75);
    expect(framesFromSeconds(1.25, 60)).toBe(75);
  });

  it('clamps progress outside the animation window', () => {
    expect(clampedProgress(3, 5, 10)).toBe(0);
    expect(clampedProgress(7.5, 5, 10)).toBe(0.5);
    expect(clampedProgress(12, 5, 10)).toBe(1);
  });

  it('normalizes Arabic variants without splitting glyphs', () => {
    expect(normalizeArabic('إبْدَاع ـ عربي!')).toBe('ابداع عربي');
  });
});
