import {Suspense, lazy, useEffect, useMemo, useState} from 'react';
import type {ComponentType} from 'react';
import {compositionFormats} from '../motion/formats';
import type {CompositionFormat} from '../motion/formats';
import {motionPresets} from '../motion/presets';
import {styleDefinitions} from '../motion/styles';
import {STYLE_SCENE_PREVIEW_FRAMES, STYLE_SCENE_SETTLED_FRAME, StyleScene} from '../motion/styles/templates';
import type {StyleSceneRole} from '../motion/styles/templates';
import {detectDirection, dominantDirection, fontFamilies, getFontFamily} from '../motion/typography';
import type {FontRole} from '../motion/typography';
import type {MotionPreset, PresetProps, StyleDefinition, TextDirection} from '../motion/types';
import {validateProject} from '../projects/contract';
import type {RegisteredProject} from '../projects/contract';
import {projectRegistry} from '../projects/registry';
import {resolveStudioUrl, studioCompositionUrl} from '../studio-config';
import {AssetPanel} from './AssetPanel';

const PreviewPlayer = lazy(() => import('./PreviewPlayer'));

type Selection =
  | {kind: 'style'; item: StyleDefinition}
  | {kind: 'preset'; item: MotionPreset}
  | {kind: 'project'; item: RegisteredProject};

// Every preview renders at the native composition size and the Player scales the result, so the
// library shows exactly what Studio draws (components sized from absolute pixel floors would lay
// out differently on a reduced canvas).
const previewFormats = {
  '16:9': {...compositionFormats.horizontal, composition: 'horizontal'},
  '9:16': {...compositionFormats.vertical, composition: 'vertical'},
  '1:1': {...compositionFormats.square, composition: 'square'},
} as const;

type PreviewFormat = keyof typeof previewFormats;
type DirectionChoice = TextDirection | 'auto';
type StylePreviewMode = 'study' | StyleSceneRole;

const formatTag = (format: CompositionFormat) =>
  (Object.keys(previewFormats) as PreviewFormat[]).find((tag) => previewFormats[tag].composition === format) ?? '16:9';

const describeProject = ({meta}: RegisteredProject) => {
  const seconds = Math.round((meta.durationInFrames / meta.fps) * 10) / 10;
  return `${seconds}s · ${meta.compositions.map((item) => formatTag(item.format)).join(' / ')} · ${meta.styleId}`;
};

const stageLabel: Record<RegisteredProject['meta']['status']['stage'], string> = {
  draft: 'Draft',
  'in-progress': 'In progress',
  'review-ready': 'Ready for review',
  'owner-accepted': 'Owner accepted',
};

export const LibraryApp = ({studioUrl = resolveStudioUrl(import.meta.env.VITE_REMOTION_STUDIO_URL)}: {studioUrl?: string}) => {
  const [selection, setSelection] = useState<Selection>({kind: 'style', item: styleDefinitions[0]});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>('16:9');
  const [presetProps, setPresetProps] = useState<PresetProps>({...motionPresets[0].defaultProps});
  const [directionChoice, setDirectionChoice] = useState<DirectionChoice>(motionPresets[0].defaultProps.direction);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [stylePreviewMode, setStylePreviewMode] = useState<StylePreviewMode>('study');
  const [styleText, setStyleText] = useState('الفكرة تتحرك');
  const [styleSupportingText, setStyleSupportingText] = useState('مشهد قابل لإعادة الاستخدام');

  useEffect(() => () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  }, [referenceUrl]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(motionPresets.map((preset) => preset.category)))],
    [],
  );
  const needle = query.toLowerCase();
  const visiblePresets = motionPresets.filter((preset) => {
    const text = `${preset.name} ${preset.description} ${preset.category}`.toLowerCase();
    return text.includes(needle) && (category === 'All' || preset.category === category);
  });
  const visibleProjects = projectRegistry.filter(({meta}) =>
    `${meta.title} ${meta.summary} ${meta.styleId} ${meta.compositions.map((item) => item.id).join(' ')}`.toLowerCase().includes(needle),
  );
  const productions = visibleProjects.filter((entry) => entry.meta.kind === 'production');
  const fixtures = visibleProjects.filter((entry) => entry.meta.kind === 'fixture');

  const title = selection.kind === 'project' ? selection.item.meta.title : selection.item.name;
  const description = selection.kind === 'project' ? selection.item.meta.summary : selection.item.description;

  // Projects only offer the formats they actually register as compositions.
  const projectFormats = selection.kind === 'project' ? selection.item.meta.compositions.map((item) => formatTag(item.format)) : null;
  const availableFormats = projectFormats ?? (Object.keys(previewFormats) as PreviewFormat[]);
  const activeFormat = availableFormats.includes(previewFormat) ? previewFormat : availableFormats[0];
  const format = previewFormats[activeFormat];
  const activeComposition = selection.kind === 'project'
    ? selection.item.meta.compositions.find((item) => item.format === format.composition)
    : undefined;

  const resolvedDirection = directionChoice === 'auto' ? detectDirection(presetProps.text) : directionChoice;
  const effectivePresetProps: PresetProps = {...presetProps, direction: resolvedDirection};

  const chooseReference = (file?: File) => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceUrl(file ? URL.createObjectURL(file) : null);
  };

  const select = (next: Selection) => {
    setSelection(next);
    setCatalogOpen(false);
  };

  const choosePreset = (preset: MotionPreset) => {
    select({kind: 'preset', item: preset});
    setPresetProps({...preset.defaultProps});
    setDirectionChoice(preset.defaultProps.direction);
  };

  const updatePreset = <Key extends keyof PresetProps>(key: Key, value: PresetProps[Key]) => {
    setPresetProps((current) => ({...current, [key]: value}));
  };

  const projectButton = (entry: RegisteredProject) => (
    <button
      key={entry.meta.id}
      type="button"
      className={selection.kind === 'project' && selection.item.meta.id === entry.meta.id ? 'production-card active' : 'production-card'}
      onClick={() => {
        select({kind: 'project', item: entry});
        setPreviewFormat(formatTag(entry.meta.compositions[0].format));
      }}
    >
      <span className="production-kicker">{describeProject(entry)}</span>
      <strong>{entry.meta.title}</strong>
      <small>{stageLabel[entry.meta.status.stage]}</small>
    </button>
  );

  const preview = (() => {
    const shared = {fps: 30, width: format.width, height: format.height};
    if (selection.kind === 'project') {
      const {meta, load} = selection.item;
      const composition = compositionFormats[format.composition];
      return (
        <PreviewPlayer
          playerKey={`${meta.id}-${activeFormat}`}
          lazyComponent={load as () => Promise<{default: ComponentType<Record<string, unknown>>}>}
          inputProps={{...meta.defaultProps, failOnIssues: false}}
          durationInFrames={meta.durationInFrames}
          fps={meta.fps}
          width={composition.width}
          height={composition.height}
        />
      );
    }
    if (selection.kind === 'preset') {
      return (
        <PreviewPlayer
          {...shared}
          playerKey={selection.item.id}
          component={selection.item.component as ComponentType<Record<string, unknown>>}
          inputProps={effectivePresetProps}
          durationInFrames={selection.item.durationInFrames}
        />
      );
    }
    if (stylePreviewMode !== 'study') {
      return (
        <PreviewPlayer
          {...shared}
          playerKey={`${selection.item.id}-${stylePreviewMode}-${activeFormat}`}
          component={StyleScene as ComponentType<Record<string, unknown>>}
          inputProps={{
            styleId: selection.item.id, role: stylePreviewMode,
            text: styleText, secondaryText: styleSupportingText,
            direction: dominantDirection(styleText, 'rtl'),
          }}
          durationInFrames={STYLE_SCENE_PREVIEW_FRAMES}
          // Opens on the settled scene, so a role or copy change is visible without pressing play.
          initialFrame={STYLE_SCENE_SETTLED_FRAME}
        />
      );
    }
    return (
      <PreviewPlayer
        {...shared}
        playerKey={`${selection.item.id}-${activeFormat}`}
        component={selection.item.previewComponent as ComponentType<Record<string, unknown>>}
        durationInFrames={120}
      />
    );
  })();

  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="24" height="24" fill="none">
              <path d="M4 12V6C4 4.89543 4.89543 4 6 4H12" stroke="#8f8aff" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M28 4H34C35.1046 4 36 4.89543 36 6V12" stroke="#8f8aff" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M36 28V34C36 35.1046 35.1046 36 34 36H28" stroke="#8f8aff" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M12 36H6C4.89543 36 4 35.1046 4 34V28" stroke="#8f8aff" strokeWidth="2.5" strokeLinecap="round" />
              <polygon points="14,20 20,14 26,20 20,26" fill="#70e1c4" opacity="0.35" />
              <path d="M20 9L29 20L20 31L11 20Z" fill="url(#topMarkGrad)" stroke="#70e1c4" strokeWidth="1.6" />
              <circle cx="20" cy="20" r="2.5" fill="#f8fafc" />
              <defs>
                <linearGradient id="topMarkGrad" x1="11" y1="9" x2="29" y2="31" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#8f8aff" />
                  <stop offset="100%" stopColor="#5548f0" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <div>
            <h1>MotionKit</h1>
            <p>Direct the idea · Code the motion · by ABUD FUN</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="local-state"><span /> local only</span>
          <button className="catalog-toggle" type="button" aria-expanded={catalogOpen} onClick={() => setCatalogOpen((open) => !open)}>
            {catalogOpen ? 'Close library' : 'Browse library'}
          </button>
          <a className="studio-link" href={studioUrl} target="_blank" rel="noreferrer" aria-label="Open Remotion Studio">
            <span className="studio-link-prefix">Open Remotion </span>Studio
          </a>
        </div>
      </header>

      <aside className={catalogOpen ? 'catalog-panel open' : 'catalog-panel'} aria-label="Motion library catalog">
        <label className="search-box">
          <span>Search library</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, drawing, data…" />
        </label>

        <section className="production-section">
          <div className="section-heading"><h2>Productions</h2><span>{productions.length}</span></div>
          <div className="project-list">{productions.map(projectButton)}</div>
        </section>

        <section>
          <div className="section-heading"><h2>QA fixtures</h2><span>{fixtures.length}</span></div>
          <div className="project-list">{fixtures.map(projectButton)}</div>
        </section>

        <section>
          <div className="section-heading"><h2>Motion styles</h2><span>{styleDefinitions.length}</span></div>
          <div className="style-list">
            {styleDefinitions.map((style) => (
              <button key={style.id} type="button" className={selection.kind === 'style' && selection.item.id === style.id ? 'catalog-button active' : 'catalog-button'} onClick={() => select({kind: 'style', item: style})}>
                <span className="swatches">{style.colors.slice(0, 3).map((color) => <i key={color} style={{background: color}} />)}</span>
                <span><strong>{style.name}</strong><small>{style.category}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="presets-section">
          <div className="section-heading"><h2>Motion presets</h2><span>{visiblePresets.length}</span></div>
          <div className="filter-row" aria-label="Preset categories">
            {categories.map((item) => <button key={item} type="button" className={category === item ? 'filter active' : 'filter'} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          <div className="preset-list">
            {visiblePresets.map((preset) => (
              <button key={preset.id} type="button" className={selection.kind === 'preset' && selection.item.id === preset.id ? 'preset-button active' : 'preset-button'} onClick={() => choosePreset(preset)}>
                <span>{preset.category}</span><strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="preview-workspace">
        <div className="preview-toolbar">
          <div>
            <span className="selection-kind">
              {selection.kind === 'style' ? 'Style study' : selection.kind === 'preset' ? selection.item.category : selection.item.meta.kind === 'production' ? 'Production' : 'QA fixture'}
            </span>
            <h2>{title}</h2>
          </div>
          <div className="format-tags" aria-label="Preview aspect ratio">
            {availableFormats.map((tag) => (
              <button key={tag} type="button" aria-pressed={activeFormat === tag} className={activeFormat === tag ? 'active' : ''} onClick={() => setPreviewFormat(tag)}>{tag}</button>
            ))}
          </div>
        </div>
        {selection.kind === 'style' ? (
          <div className="control-dock" aria-label="Style scene template controls">
            <label><span>Preview scene</span>
              <select aria-label="Preview scene" value={stylePreviewMode} onChange={(event) => setStylePreviewMode(event.target.value as StylePreviewMode)}>
                <option value="study">Original style study</option>
                <option value="title">Opening / title</option>
                <option value="explainer">Explainer beat</option>
                <option value="end-card">End card</option>
              </select>
            </label>
            {stylePreviewMode !== 'study' ? (
              <>
                <label><span>Scene headline</span><input aria-label="Scene headline" value={styleText} dir={dominantDirection(styleText, 'rtl')} onChange={(event) => setStyleText(event.target.value)} /></label>
                <label><span>Scene supporting text</span><input aria-label="Scene supporting text" value={styleSupportingText} dir={dominantDirection(styleSupportingText, 'rtl')} onChange={(event) => setStyleSupportingText(event.target.value)} /></label>
              </>
            ) : null}
          </div>
        ) : null}
        {selection.kind === 'preset' ? (
          <div className="control-dock" aria-label="Live preset controls">
            {selection.item.configurable.includes('text') ? (
              <label><span>Primary text</span><input value={presetProps.text} dir={resolvedDirection} onChange={(event) => updatePreset('text', event.target.value)} /></label>
            ) : null}
            {selection.item.configurable.includes('secondaryText') ? (
              <label><span>Supporting text</span><input value={presetProps.secondaryText ?? ''} dir={resolvedDirection} onChange={(event) => updatePreset('secondaryText', event.target.value)} /></label>
            ) : null}
            {selection.item.configurable.includes('accent') ? (
              <label className="color-control"><span>Accent color</span><input type="color" value={presetProps.accent} onChange={(event) => updatePreset('accent', event.target.value)} /></label>
            ) : null}
            {selection.item.configurable.includes('direction') ? (
              <label>
                <span>Text direction</span>
                <select value={directionChoice} onChange={(event) => setDirectionChoice(event.target.value as DirectionChoice)}>
                  <option value="auto">Auto ({detectDirection(presetProps.text) === 'rtl' ? 'RTL' : 'LTR'} from text)</option>
                  <option value="ltr">Left to right</option>
                  <option value="rtl">Right to left</option>
                </select>
              </label>
            ) : null}
            {selection.item.configurable.includes('typeface') ? (
              <label>
                <span>Typeface</span>
                <select value={presetProps.typeface ?? 'display'} onChange={(event) => updatePreset('typeface', event.target.value as FontRole)}>
                  {fontFamilies.map((family) => <option key={family.role} value={family.role}>{family.label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        <div className={`player-frame format-${activeFormat.replace(':', '-')}`}>
          <Suspense fallback={<div className="player-loading" role="status">Loading preview…</div>}>{preview}</Suspense>
        </div>
        <div className="detail-grid">
          <article className="detail-copy">
            <p>{description}</p>
            {selection.kind === 'style' ? (
              <>
                <h3>Animation language</h3>
                <ul>{selection.item.identity.map((rule) => <li key={rule}>{rule}</li>)}</ul>
                <h3>Use it for</h3><p>{selection.item.recommendedFor}</p>
                <small className="attribution">{selection.item.attribution}</small>
              </>
            ) : selection.kind === 'preset' ? (
              <>
                <h3>Configurable properties</h3>
                <div className="property-list">{selection.item.configurable.map((property) => <code key={property}>{property}</code>)}</div>
                <h3>Usage</h3><pre>{selection.item.usage}</pre>
              </>
            ) : (
              <ProjectDetail entry={selection.item} studioUrl={studioUrl} compositionId={activeComposition?.id ?? selection.item.meta.compositions[0].id} />
            )}
          </article>

          <aside className="reference-inspector">
            <div><span className="selection-kind">Personal reference</span><h3>Inspect before you build</h3></div>
            {referenceUrl ? <video src={referenceUrl} controls /> : <div className="reference-empty"><span>Drop into a private viewing session</span><small>The browser does not upload or persist this file.</small></div>}
            <label className="file-picker">
              <input type="file" accept="video/*" aria-label="Inspect a reference video" onChange={(event) => chooseReference(event.target.files?.[0])} />
              Choose reference video
            </label>
            <p className="command-note">To save and analyze it: <code>npm run reference:import -- &lt;path&gt; --name &lt;name&gt;</code></p>
          </aside>
        </div>
      </main>
    </div>
  );
};

const ProjectDetail = ({entry, studioUrl, compositionId}: {entry: RegisteredProject; studioUrl: string; compositionId: string}) => {
  const {meta} = entry;
  const warnings = validateProject(meta).filter((issue) => issue.severity === 'warning');
  return (
    <>
      <a className="studio-entry" href={studioCompositionUrl(studioUrl, compositionId)} target="_blank" rel="noreferrer">
        Review {meta.title} in Studio
      </a>
      <h3>Project</h3>
      <dl className="project-facts">
        <dt>Status</dt><dd>{stageLabel[meta.status.stage]}{meta.status.lastVerified ? ` · verified ${meta.status.lastVerified}` : ''}</dd>
        <dt>Language</dt><dd>{meta.language} · {meta.direction.toUpperCase()}</dd>
        <dt>Timing</dt><dd>{meta.durationInFrames} frames at {meta.fps} fps</dd>
        <dt>Compositions</dt><dd>{meta.compositions.map((item) => item.id).join(', ')}</dd>
        <dt>Fonts</dt><dd>{meta.fonts.length ? meta.fonts.map((role) => getFontFamily(role).label).join(', ') : 'System stack (legacy)'}</dd>
        {meta.docsPath ? (<><dt>Docs</dt><dd><code>{meta.docsPath}/</code></dd></>) : null}
      </dl>
      {meta.status.notes ? <p className="project-note">{meta.status.notes}</p> : null}
      {warnings.length ? (
        <ul className="project-warnings" aria-label="Project warnings">
          {warnings.map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}
        </ul>
      ) : null}
      <AssetPanel entry={entry} />
      <h3>Scenes</h3>
      <ol className="scene-list">
        {meta.scenes.map((scene) => (
          <li key={scene.id}>
            <strong>{scene.title}</strong>
            <span>frames {scene.from}–{scene.from + scene.durationInFrames - 1}{scene.reviewFrame !== undefined ? ` · review at ${(scene.reviewFrame / meta.fps).toFixed(1)}s` : ''}</span>
          </li>
        ))}
      </ol>
    </>
  );
};
