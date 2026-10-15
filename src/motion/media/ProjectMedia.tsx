import {createContext, useContext, useEffect, useState} from 'react';
import type {CSSProperties, FC, ReactNode} from 'react';
import {cancelRender, continueRender, delayRender, getRemotionEnvironment, staticFile} from 'remotion';
import {fontStack} from '../typography/fonts';
import {findAsset, manifestPath, validateManifest} from './manifest';
import type {AssetKind, AssetManifest, AssetRecord, AssetRole, AudioMetadata} from './manifest';
import {validateTiming} from './timing';
import type {VoiceoverTiming} from './timing';

// Runtime access to a project's imported media. <ProjectMediaProvider projectId> loads the
// manifest and every voiceover timing it links, once, before the first frame is considered ready;
// components then ask for assets by id. A missing manifest, asset, or timing is shown as a labelled
// placeholder in Studio and the library and cancels a render — it is never replaced by an
// unrelated image or by silence.

export type ProjectMediaState =
  | {status: 'loading'}
  | {status: 'ready'; manifest: AssetManifest; timings: ReadonlyMap<string, VoiceoverTiming | {error: string}>}
  | {status: 'missing'; reason: string};

// Renders load each project's media once per page. Previews (Studio, library) fetch afresh whenever a
// provider mounts, so media imported or re-timed while they are open appears on the next reload of
// the composition instead of being hidden behind a stale cache.
const cache = new Map<string, Promise<ProjectMediaState>>();
const inflight = new Set<Promise<ProjectMediaState>>();

const fetchJson = async (url: string): Promise<{ok: true; value: unknown} | {ok: false; reason: string}> => {
  try {
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) return {ok: false, reason: `not found (${response.status})`};
    const text = await response.text();
    try {
      return {ok: true, value: JSON.parse(text)};
    } catch {
      // Dev servers answer unknown paths with the HTML app shell; that is a missing file too.
      return {ok: false, reason: 'not found (no JSON at that path)'};
    }
  } catch (error) {
    return {ok: false, reason: `could not be loaded (${error instanceof Error ? error.message : String(error)})`};
  }
};

/** Loads (once per project and page) the manifest plus the timing file of every voiceover. */
export const loadProjectMedia = (projectId: string, {fresh = false} = {}): Promise<ProjectMediaState> => {
  const cached = cache.get(projectId);
  if (cached && !fresh) return cached;
  const promise = (async (): Promise<ProjectMediaState> => {
    const loaded = await fetchJson(staticFile(manifestPath(projectId)));
    if (!loaded.ok) return {status: 'missing', reason: `project "${projectId}" has no media manifest (${loaded.reason}); import with npm run asset:import -- --project ${projectId}`};
    const errors = validateManifest(loaded.value, projectId).filter((issue) => issue.severity === 'error');
    if (errors.length) return {status: 'missing', reason: `project "${projectId}" media manifest is invalid (${errors[0].path}: ${errors[0].message})`};
    const manifest = loaded.value as AssetManifest;
    const timings = new Map<string, VoiceoverTiming | {error: string}>();
    await Promise.all(
      manifest.assets
        .filter((asset) => asset.timing)
        .map(async (asset) => {
          const timing = await fetchJson(staticFile(asset.timing!.file));
          if (!timing.ok) return void timings.set(asset.id, {error: `timing file ${timing.reason}`});
          const problems = validateTiming(timing.value, (asset.metadata as AudioMetadata).durationSeconds).filter((issue) => issue.severity === 'error');
          timings.set(asset.id, problems.length ? {error: `invalid timing (${problems[0].message})`} : (timing.value as VoiceoverTiming));
        }),
    );
    return {status: 'ready', manifest, timings};
  })();
  cache.set(projectId, promise);
  inflight.add(promise);
  void promise.finally(() => inflight.delete(promise));
  return promise;
};

/** Resolves once every manifest and timing requested so far has loaded (or failed). For QA tools. */
export const mediaSettled = async () => {
  await Promise.all([...inflight, ...cache.values()]);
};

/** Clears loaded manifests and timings (tests, or after importing while a page is open). */
export const resetMediaCache = () => cache.clear();

const MediaContext = createContext<{projectId: string; state: ProjectMediaState} | null>(null);

export const ProjectMediaProvider: FC<{projectId: string; children: ReactNode}> = ({projectId, children}) => {
  const [state, setState] = useState<ProjectMediaState>({status: 'loading'});
  // Held only while rendering (stills, owner export), which never runs under StrictMode, so a
  // double-invoked initialiser can never orphan a handle in the library.
  const [handle] = useState(() => (getRemotionEnvironment().isRendering ? delayRender(`Loading media for ${projectId}`) : null));
  useEffect(() => {
    let active = true;
    loadProjectMedia(projectId, {fresh: handle === null}).then((next) => {
      if (active) setState(next);
      if (handle !== null) continueRender(handle);
    });
    return () => {
      active = false;
    };
  }, [projectId, handle]);
  return <MediaContext.Provider value={{projectId, state}}>{children}</MediaContext.Provider>;
};

export type AssetState =
  | {status: 'loading'}
  | {status: 'ready'; asset: AssetRecord; src: string}
  | {status: 'missing'; reason: string};

/**
 * An imported asset by id. `kind`/`roles` assert what the caller can draw, so an audio id passed to
 * an image component is reported instead of rendering a broken element.
 */
type Expect = {kind?: AssetKind; roles?: readonly AssetRole[]};

const resolveAsset = (context: {projectId: string; state: ProjectMediaState} | null, id: string | undefined, expect?: Expect): AssetState => {
  if (!context) return {status: 'missing', reason: `asset "${id}" is used outside <ProjectMediaProvider>`};
  const {projectId, state} = context;
  if (!id) return {status: 'missing', reason: 'no asset id given'};
  if (state.status !== 'ready') return state;
  const asset = findAsset(state.manifest, id);
  if (!asset) return {status: 'missing', reason: `asset "${id}" is not imported in project "${projectId}"`};
  if (expect?.kind && asset.kind !== expect.kind) return {status: 'missing', reason: `asset "${id}" is ${asset.kind}, expected ${expect.kind}`};
  if (expect?.roles && !expect.roles.includes(asset.role)) return {status: 'missing', reason: `asset "${id}" is a ${asset.role}, expected ${expect.roles.join(' or ')}`};
  return {status: 'ready', asset, src: staticFile(asset.file)};
};

export const useAsset = (id: string | undefined, expect?: Expect): AssetState => resolveAsset(useContext(MediaContext), id, expect);

/** Several assets at once (character poses and layers); one context read, a stable hook count. */
export const useAssets = (ids: readonly string[], expect?: Expect): AssetState[] => {
  const context = useContext(MediaContext);
  return ids.map((id) => resolveAsset(context, id, expect));
};

export type TimingState = {status: 'loading'} | {status: 'ready'; timing: VoiceoverTiming; asset: AssetRecord} | {status: 'missing'; reason: string};

/** The project-scoped timing generated by npm run voiceover:align for a voiceover asset. */
export const useVoiceoverTiming = (voiceoverId: string | undefined): TimingState => {
  const context = useContext(MediaContext);
  const voiceover = useAsset(voiceoverId, {kind: 'audio', roles: ['voiceover']});
  if (voiceover.status !== 'ready') return voiceover;
  const timing = context?.state.status === 'ready' ? context.state.timings.get(voiceover.asset.id) : undefined;
  if (!timing) return {status: 'missing', reason: `voiceover "${voiceoverId}" has no timing yet; run npm run voiceover:align -- --project ${context?.projectId}`};
  if ('error' in timing) return {status: 'missing', reason: `voiceover "${voiceoverId}": ${timing.error}`};
  return {status: 'ready', timing, asset: voiceover.asset};
};

/** Cancels a render whose required media is missing, so an incomplete video is never produced. */
export const useFailRenderWhenMissing = (state: {status: string; reason?: string}) => {
  const missing = state.status === 'missing' ? state.reason : undefined;
  useEffect(() => {
    if (missing && getRemotionEnvironment().isRendering) cancelRender(new Error(`Missing media: ${missing}`));
  }, [missing]);
};

/** Visible placeholder for missing media (previews only; renders are cancelled instead). */
export const MissingAsset: FC<{reason: string; style?: CSSProperties}> = ({reason, style}) => (
  <div
    data-missing-asset={reason}
    dir="ltr"
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4%',
      boxSizing: 'border-box',
      border: '4px dashed #ff5b5b',
      background: 'repeating-linear-gradient(45deg, rgba(255,91,91,0.14) 0 18px, rgba(255,91,91,0.05) 18px 36px)',
      color: '#ffc4c4',
      fontFamily: fontStack('text'),
      fontSize: 22,
      lineHeight: 1.3,
      textAlign: 'center',
      overflowWrap: 'anywhere',
      ...style,
    }}
  >
    Missing media — {reason}
  </div>
);

/** Asset state plus the render guard, for components that cannot draw without the asset. */
export const useRequiredAsset = (id: string | undefined, expect?: Parameters<typeof useAsset>[1]) => {
  const state = useAsset(id, expect);
  useFailRenderWhenMissing(state);
  return state;
};
