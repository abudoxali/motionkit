import {useEffect, useState} from 'react';
import {describeAsset, manifestPath, validateManifest} from '../motion/media/manifest';
import type {AssetManifest, AssetRecord} from '../motion/media/manifest';
import type {RegisteredProject} from '../projects/contract';

// Read-only view of a project's imported media: what is available, what each file is, and whether
// it can preview. The library never imports or saves files; that is npm run asset:import.

type PanelState =
  | {status: 'loading'}
  | {status: 'none'}
  | {status: 'invalid'; reason: string}
  | {status: 'ready'; manifest: AssetManifest; present: Record<string, boolean>};

const base = () => (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');

const fileExists = async (file: string) => {
  try {
    const response = await fetch(`${base()}${file}`, {method: 'HEAD'});
    // The dev server answers unknown paths with the HTML shell, which is not the asset.
    return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
};

const loadPanel = async (projectId: string): Promise<PanelState> => {
  try {
    const response = await fetch(`${base()}${manifestPath(projectId)}`, {cache: 'no-store'});
    if (!response.ok) return {status: 'none'};
    const text = await response.text();
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return {status: 'none'};
    }
    const errors = validateManifest(value, projectId).filter((issue) => issue.severity === 'error');
    if (errors.length) return {status: 'invalid', reason: `${errors[0].path}: ${errors[0].message}`};
    const manifest = value as AssetManifest;
    const checks = await Promise.all(manifest.assets.map(async (asset) => [asset.id, await fileExists(asset.file)] as const));
    return {status: 'ready', manifest, present: Object.fromEntries(checks)};
  } catch {
    return {status: 'none'};
  }
};

const Preview = ({asset, present}: {asset: AssetRecord; present: boolean}) => {
  if (!present) return <span className="asset-thumb asset-thumb-missing" aria-hidden="true">!</span>;
  if (asset.kind === 'image') return <img className="asset-thumb" src={`${base()}${asset.file}`} alt="" loading="lazy" />;
  return <span className="asset-thumb" aria-hidden="true">{asset.kind === 'audio' ? '♪' : asset.kind === 'video' ? '▶' : '¶'}</span>;
};

export const AssetPanel = ({entry}: {entry: RegisteredProject}) => {
  const {meta} = entry;
  const [state, setState] = useState<PanelState>({status: 'loading'});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setState({status: 'loading'});
    void loadPanel(meta.id).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [meta.id, reload]);

  const required = meta.media?.assets ?? [];
  const imported = state.status === 'ready' ? state.manifest.assets : [];
  const notImported = required.filter((id) => !imported.some((asset) => asset.id === id));

  return (
    <section className="asset-panel" aria-label="Project media">
      <div className="asset-panel-head">
        <h3>Media</h3>
        <button type="button" className="asset-refresh" onClick={() => setReload((value) => value + 1)}>Refresh</button>
      </div>
      {state.status === 'loading' ? <p className="project-note">Reading the media manifest…</p> : null}
      {state.status === 'invalid' ? <p className="project-warnings">The media manifest is invalid: {state.reason}</p> : null}
      {state.status === 'none' ? (
        <p className="project-note">
          No media imported for this project on this machine.
          {meta.id === 'qa-media' ? <> Generate the synthetic QA media with <code>npm run qa:media</code>.</> : null}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <ul className="asset-list">
          {state.manifest.assets.map((asset) => (
            <li key={asset.id} data-asset-id={asset.id}>
              <Preview asset={asset} present={state.present[asset.id]} />
              <div>
                <strong>{asset.id}</strong> <span className="asset-role">{asset.role}</span>
                <small>{describeAsset(asset)}</small>
                <small className={state.present[asset.id] && asset.browserPreview ? 'asset-ok' : 'asset-bad'}>
                  {!state.present[asset.id] ? 'File missing' : asset.browserPreview ? 'Previewable' : 'Not previewable in the browser'}
                  {asset.timing ? ` · timing: ${asset.timing.method}${asset.timing.lowConfidenceWords ? ` (${asset.timing.lowConfidenceWords} low-confidence words)` : ''}` : ''}
                  {required.includes(asset.id) ? ' · used by this project' : ''}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {notImported.length && state.status !== 'loading' ? (
        <ul className="project-warnings" aria-label="Missing media">
          {notImported.map((id) => <li key={id}>Needed but not imported: {id}</li>)}
        </ul>
      ) : null}
      <p className="command-note">
        Saved assets come only from <code>npm run asset:import -- --project {meta.id} --file "&lt;path&gt;"</code>; files stay in the git-ignored <code>public/user-assets/{meta.id}/</code>.
      </p>
    </section>
  );
};
