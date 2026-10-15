import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {fontFamilies} from './fonts';

export type FontLoadState = 'idle' | 'loading' | 'ready' | 'failed' | 'unsupported';

let state: FontLoadState = 'idle';
let pending: Promise<FontLoadState> | null = null;
let failure: Error | null = null;
const listeners = new Set<(next: FontLoadState) => void>();

const setState = (next: FontLoadState) => {
  state = next;
  for (const listener of listeners) listener(next);
};

const canLoadFonts = () =>
  typeof document !== 'undefined' && typeof FontFace !== 'undefined' && 'fonts' in document;

/**
 * Registers and loads every bundled face exactly once. Rendering is held with delayRender()
 * until the files are decoded, and a missing or corrupt file cancels the render loudly rather
 * than letting the browser fall back to a system font. Environments without the FontFace API
 * (Node, jsdom) report "unsupported" and never block.
 */
export const loadProjectFonts = (): Promise<FontLoadState> => {
  if (pending) return pending;
  if (!canLoadFonts()) {
    setState('unsupported');
    pending = Promise.resolve(state);
    return pending;
  }

  setState('loading');
  const handle = delayRender('Loading ABUD project fonts', {timeoutInMilliseconds: 20000});
  const faces = fontFamilies.flatMap((family) =>
    family.faces.map(
      (face) =>
        new FontFace(family.family, `url("${staticFile(face.file)}") format("woff2")`, {
          weight: face.weight,
          style: 'normal',
          unicodeRange: face.unicodeRange,
          display: 'block',
        }),
    ),
  );

  pending = Promise.all(
    faces.map(async (face) => {
      document.fonts.add(face);
      await face.load();
    }),
  ).then(
    () => {
      setState('ready');
      continueRender(handle);
      return state;
    },
    (error: unknown) => {
      failure = error instanceof Error ? error : new Error(String(error));
      const message = `Project fonts failed to load: ${failure.message}`;
      console.error(message);
      setState('failed');
      // Fails a render or still loudly; cancelRender throws by design, so keep it from
      // surfacing as an unhandled rejection in the library.
      try {
        cancelRender(new Error(message));
      } catch {
        // Already reported above.
      }
      return state;
    },
  );
  return pending;
};

export const getFontLoadState = () => state;
export const getFontLoadError = () => failure;

/**
 * Starts the font load during render (so delayRender is registered before any frame is captured)
 * and re-renders when fonts settle. Text measurement must wait for `true`. After a failure it
 * returns `true` so the library still shows text; renders were already cancelled loudly.
 */
export const useProjectFontsReady = () => {
  const [current, setCurrent] = useState(() => {
    void loadProjectFonts();
    return state;
  });
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(state);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current === 'ready' || current === 'unsupported' || current === 'failed';
};

/** Test-only reset so suites can exercise the loader from a clean slate. */
export const resetFontLoaderForTests = () => {
  state = 'idle';
  pending = null;
  failure = null;
  listeners.clear();
};
