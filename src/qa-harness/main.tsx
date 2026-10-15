import {useEffect, useState} from 'react';
import type {ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
import {Thumbnail} from '@remotion/player';
import {canvasMetrics} from '../motion/core/layout';
import {compositionFormats} from '../motion/formats';
import type {CompositionFormat} from '../motion/formats';
import {motionPresets} from '../motion/presets';
import {styleDefinitions} from '../motion/styles';
import {STYLE_SCENE_PREVIEW_FRAMES, STYLE_SCENE_ROLES, StyleScene} from '../motion/styles/templates';
import type {StyleSceneRole} from '../motion/styles/templates';
import {mediaSettled} from '../motion/media/ProjectMedia';
import {getFontLoadState, loadProjectFonts} from '../motion/typography/loader';
import {auditFittedBlocks, auditTypography} from '../motion/typography/qa';
import type {FittedBlockReport, TypographyIssue} from '../motion/typography/qa';
import {projectRegistry} from '../projects/registry';

// Browser QA harness for Playwright (served by the Vite dev server at /qa.html, never built).
// It renders one registered composition, catalog preset, or style scene at one frame through
// Remotion's Thumbnail, waits for the bundled fonts and text fitting to settle, audits the
// typography, and publishes the result on window.__qa so tests read facts instead of guessing.
//
//   /qa.html?composition=QA-Typography-Bidi-Vertical&scale=0.5[&frame=12][&props=<url-encoded JSON>]
//   /qa.html?preset=kinetic-stack&format=vertical[&frame=60][&props=<url-encoded JSON>]
//   /qa.html?style=whiteboard&role=explainer&format=square[&frame=30][&props=<url-encoded JSON>]

export type QaResult = {
  status: 'loading' | 'ready' | 'error';
  target: string;
  frame: number;
  fontState: string;
  issues: TypographyIssue[];
  blocks: FittedBlockReport[];
  error?: string;
};

declare global {
  interface Window {
    __qa?: QaResult;
    /** Shows another frame without reloading; resolve when window.__qa.frame equals it and is ready. */
    __qaSetFrame?: (frame: number) => void;
  }
}

type Target = {
  id: string;
  load: () => Promise<ComponentType<Record<string, unknown>>>;
  inputProps: Record<string, unknown>;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
  defaultFrame: number;
  /** Fixtures carry per-card QA markers; presets are audited block by block. */
  mode: 'fixture' | 'preset';
};

const params = new URLSearchParams(window.location.search);
const scale = Number(params.get('scale') ?? '0.5');

const publish = (result: QaResult) => {
  window.__qa = result;
  document.body.dataset.qaStatus = result.status;
};

const resolveTarget = (): Target | string => {
  let overrides: Record<string, unknown> = {};
  try {
    overrides = params.has('props') ? (JSON.parse(params.get('props')!) as Record<string, unknown>) : {};
  } catch {
    return 'props must be JSON';
  }
  const compositionId = params.get('composition');
  if (compositionId) {
    const entry = projectRegistry.find(({meta}) => meta.compositions.some((item) => item.id === compositionId));
    const composition = entry?.meta.compositions.find((item) => item.id === compositionId);
    if (!entry || !composition) return `Unknown composition "${compositionId}"`;
    return {
      id: compositionId,
      load: () => entry.load().then((module) => module.default as ComponentType<Record<string, unknown>>),
      inputProps: {...entry.meta.defaultProps, failOnIssues: false, ...overrides},
      ...compositionFormats[composition.format],
      durationInFrames: entry.meta.durationInFrames,
      fps: entry.meta.fps,
      defaultFrame: entry.meta.durationInFrames - 1,
      mode: 'fixture',
    };
  }
  const format = (params.get('format') ?? 'horizontal') as CompositionFormat;
  if (!(format in compositionFormats)) return `Unknown format "${format}"`;
  const styleId = params.get('style');
  if (styleId !== null) {
    if (!styleDefinitions.some((style) => style.id === styleId)) return `Unknown style "${styleId}"`;
    const role = params.get('role') as StyleSceneRole;
    if (!STYLE_SCENE_ROLES.includes(role)) return `Unknown style role "${role}"`;
    return {
      id: `Style-${styleId}-${role}-${format}`,
      load: async () => StyleScene as ComponentType<Record<string, unknown>>,
      inputProps: {styleId, role, text: 'الفكرة تتحرك', secondaryText: 'مشهد قابل لإعادة الاستخدام', ...overrides},
      ...compositionFormats[format],
      durationInFrames: STYLE_SCENE_PREVIEW_FRAMES,
      fps: 30,
      defaultFrame: STYLE_SCENE_PREVIEW_FRAMES - 1,
      mode: 'preset',
    };
  }
  const presetId = params.get('preset');
  const preset = motionPresets.find((item) => item.id === presetId);
  if (!preset) return `Unknown preset "${presetId}"`;
  return {
    id: `Preset-${preset.id}-${format}`,
    load: async () => preset.component as ComponentType<Record<string, unknown>>,
    inputProps: {...preset.defaultProps, ...overrides},
    ...compositionFormats[format],
    durationInFrames: preset.durationInFrames,
    fps: 30,
    // Presets settle by their last frame (Word Cascade reveals across its whole duration).
    defaultFrame: preset.durationInFrames - 1,
    mode: 'preset',
  };
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const Harness = ({target}: {target: Target}) => {
  const [component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [frame, setFrame] = useState(() => (params.has('frame') ? Number(params.get('frame')) : target.defaultFrame));

  useEffect(() => {
    // Frame sweeps reuse one page: the audit below re-runs and republishes for each frame.
    window.__qaSetFrame = (next) => {
      // Asking for the frame already on screen changes no state, so the audit would not re-run;
      // the published result for it is still current.
      if (window.__qa?.frame === next && window.__qa.status !== 'loading') return;
      publish({status: 'loading', target: target.id, frame: next, fontState: getFontLoadState(), issues: [], blocks: []});
      setFrame(next);
    };
    return () => {
      delete window.__qaSetFrame;
    };
  }, [target]);

  useEffect(() => {
    void target.load().then((loaded) => setComponent(() => loaded));
  }, [target]);

  useEffect(() => {
    if (!component) return;
    let cancelled = false;
    const settle = async () => {
      await loadProjectFonts();
      // Wait until every fitted block has measured (no "pending" layouts) and paint has happened.
      const waitForLayout = async () => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          await nextFrame();
          if (!document.querySelector('[data-typography-fit="pending"]') && document.querySelector('#qa-stage [data-remotion-canvas], #qa-stage div')) break;
        }
      };
      await waitForLayout();
      // Owner-media compositions draw their images and captions only after the manifest and timing
      // load, so wait for those, for the images to decode, and for the new text to fit.
      await mediaSettled();
      await waitForLayout();
      await Promise.all([...document.querySelectorAll<HTMLImageElement>('#qa-stage img')].map((image) => image.decode().catch(() => undefined)));
      await document.fonts.ready;
      await nextFrame();
      if (cancelled) return;
      const stage = document.getElementById('qa-stage')!;
      const canvas = stage.getBoundingClientRect();
      let issues: TypographyIssue[];
      let blocks: FittedBlockReport[] = [];
      if (target.mode === 'fixture') {
        const safe = stage.querySelector<HTMLElement>('[data-qa-safe]');
        issues = safe ? auditTypography(stage, safe.getBoundingClientRect()) : [];
      } else {
        const {safeRect} = canvasMetrics(target.width, target.height);
        const ratio = canvas.width / target.width;
        const safe = new DOMRect(canvas.left + safeRect.x * ratio, canvas.top + safeRect.y * ratio, safeRect.width * ratio, safeRect.height * ratio);
        ({issues, blocks} = auditFittedBlocks(stage, canvas, safe));
      }
      publish({status: 'ready', target: target.id, frame, fontState: getFontLoadState(), issues, blocks});
    };
    void settle();
    return () => {
      cancelled = true;
    };
  }, [component, frame, target]);

  if (!component) return null;
  return (
    <div id="qa-stage" style={{width: target.width * scale, height: target.height * scale}}>
      <Thumbnail
        component={component}
        compositionWidth={target.width}
        compositionHeight={target.height}
        durationInFrames={target.durationInFrames}
        fps={target.fps}
        frameToDisplay={frame}
        inputProps={target.inputProps}
        style={{width: target.width * scale, height: target.height * scale}}
      />
    </div>
  );
};

const target = resolveTarget();
if (typeof target === 'string') {
  publish({status: 'error', target: '', frame: -1, fontState: getFontLoadState(), issues: [], blocks: [], error: target});
} else {
  publish({status: 'loading', target: target.id, frame: -1, fontState: getFontLoadState(), issues: [], blocks: []});
  createRoot(document.getElementById('root')!).render(<Harness target={target} />);
}
