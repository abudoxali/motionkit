import {describe, expect, it} from 'vitest';
import {motionPresets} from '../motion/presets';
import {styleDefinitions} from '../motion/styles';
import {compositionFormats} from '../motion/formats';
import {sanitizePresetProps} from '../motion/presetProps';
import * as presetExports from '../motion/components/MotionPresets';

describe('motion catalog', () => {
  it('exposes at least twelve unique, runnable presets', () => {
    const ids = motionPresets.map((preset) => preset.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of motionPresets) {
      expect(typeof preset.component).toBe('function');
      expect(preset.defaultProps.text.length).toBeGreaterThan(0);
      expect(preset.durationInFrames).toBeGreaterThanOrEqual(60);
    }
  });

  it('keeps all four upstream styles discoverable with an original preview', () => {
    expect(styleDefinitions.map((style) => style.id).sort()).toEqual([
      'chalkboard',
      'doodle',
      'plotter',
      'whiteboard',
    ]);
    for (const style of styleDefinitions) {
      expect(typeof style.previewComponent).toBe('function');
      expect(style.attribution.length).toBeGreaterThan(10);
      expect(style.referencePolicy).toBe('code-preview-only');
    }
  });

  it('offers horizontal, vertical, and square format dimensions', () => {
    expect(compositionFormats).toEqual({
      horizontal: {width: 1920, height: 1080},
      vertical: {width: 1080, height: 1920},
      square: {width: 1080, height: 1080},
    });
  });
});

describe('preset props sanitiser', () => {
  it('keeps the 12 catalog ids stable', () => {
    expect(motionPresets.map((preset) => preset.id)).toEqual([
      'kinetic-stack', 'title-orbit', 'lower-third-beam', 'logo-prism-reveal', 'marker-highlight', 'word-cascade',
      'hand-drawn-route', 'whiteboard-explainer', 'camera-parallax', 'count-up-stat', 'shape-morph', 'social-promo',
    ]);
  });

  it('passes valid props through unchanged', () => {
    const props = {text: 'ركّز', secondaryText: 'Focus', accent: '#ff3355', direction: 'rtl' as const, typeface: 'text' as const};
    expect(sanitizePresetProps(props)).toEqual(props);
  });

  it('repairs malformed props instead of crashing', () => {
    expect(sanitizePresetProps({text: 42, secondaryText: null, accent: '', direction: 'sideways', typeface: 'serif'})).toEqual({
      text: '',
      secondaryText: undefined,
      accent: '#4f7cff',
      direction: 'ltr',
      typeface: 'display',
    });
    expect(sanitizePresetProps({text: 'الفكرة', direction: 'up'}).direction).toBe('rtl');
    expect(sanitizePresetProps({accent: 'rgb(1, 2, 3)'}).accent).toBe('rgb(1, 2, 3)');
  });

  it('wraps every exported preset component, not only catalog entries', () => {
    for (const [name, component] of Object.entries(presetExports)) {
      expect((component as {displayName?: string}).displayName, name).toBe(name);
    }
  });
});
