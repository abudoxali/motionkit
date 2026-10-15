import {compositionFormats} from '../motion/formats';
import type {CompositionFormat} from '../motion/formats';
import {COMPOSITION_ID_PATTERN, PROJECT_ID_PATTERN, STYLE_IDS, defineScenes} from './contract';
import type {ProjectLanguage, StyleId} from './contract';

// Pure planning for `npm run project:new`: validates options and produces the exact files and
// registry edits. File I/O, duplicate lookup, and rollback live in scripts/project-new.ts.

export type ScaffoldOptions = {
  id: string;
  title?: string;
  language?: ProjectLanguage;
  formats?: CompositionFormat[];
  fps?: number;
  durationSeconds?: number;
  styleId?: StyleId | 'custom';
};

export type ScaffoldFile = {path: string; content: string};

export type ScaffoldPlan = {
  id: string;
  title: string;
  compositionIds: string[];
  /** Repo-relative POSIX paths, in creation order. */
  files: ScaffoldFile[];
  directories: string[];
  registryImport: string;
  registryEntry: string;
};

export const REGISTRY_PATH = 'src/projects/registry.ts';
export const REGISTRY_IMPORT_MARKER = '// project:new imports';
export const REGISTRY_ENTRY_MARKER = '  // project:new entries';

const RESERVED_IDS = new Set(['contract', 'registry', 'scaffold', 'fixtures', 'con', 'prn', 'aux', 'nul', ...Array.from({length: 9}, (_, i) => [`com${i + 1}`, `lpt${i + 1}`]).flat()]);
const LANGUAGES: readonly ProjectLanguage[] = ['ar', 'en', 'ar-en'];

const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);
const capitalizedParts = (id: string) => id.split('-').map(capitalize);
const pascal = (id: string) => capitalizedParts(id).join('');
const camel = (id: string) => pascal(id)[0].toLowerCase() + pascal(id).slice(1);
const titleCase = (id: string) => capitalizedParts(id).join(' ');

export const compositionIdsFor = (id: string, formats: readonly CompositionFormat[]) =>
  formats.map((format) => `${capitalizedParts(id).join('-')}-${capitalize(format)}`);

export const validateScaffoldOptions = (
  options: ScaffoldOptions,
  existing: {projectIds: readonly string[]; compositionIds: readonly string[]} = {projectIds: [], compositionIds: []},
): string[] => {
  const errors: string[] = [];
  const {id} = options;
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || !PROJECT_ID_PATTERN.test(id)) {
    errors.push(`--id "${id}" must be kebab-case starting with a letter (a-z, 0-9, single hyphens); no slashes, dots, or spaces`);
  } else {
    if (id.length < 3 || id.length > 48) errors.push('--id must be 3–48 characters');
    if (RESERVED_IDS.has(id)) errors.push(`--id "${id}" is reserved`);
    if (existing.projectIds.includes(id)) errors.push(`project "${id}" is already registered`);
    for (const compositionId of compositionIdsFor(id, options.formats ?? ['vertical'])) {
      if (!COMPOSITION_ID_PATTERN.test(compositionId)) errors.push(`composition id "${compositionId}" is invalid`);
      if (existing.compositionIds.includes(compositionId)) errors.push(`composition "${compositionId}" is already registered`);
    }
  }
  if (options.language && !LANGUAGES.includes(options.language)) errors.push(`--language must be one of ${LANGUAGES.join(', ')}`);
  const formats = options.formats ?? ['vertical'];
  if (formats.length === 0) errors.push('--format needs at least one format');
  for (const format of formats) if (!(format in compositionFormats)) errors.push(`unknown --format "${format}" (use ${Object.keys(compositionFormats).join(', ')})`);
  if (new Set(formats).size !== formats.length) errors.push('--format lists a format twice');
  if (options.fps !== undefined && (!Number.isInteger(options.fps) || options.fps < 1 || options.fps > 120)) errors.push('--fps must be an integer from 1 to 120');
  if (options.durationSeconds !== undefined && !(options.durationSeconds > 0 && options.durationSeconds <= 600)) errors.push('--duration must be between 0 and 600 seconds');
  if (options.styleId && options.styleId !== 'custom' && !STYLE_IDS.includes(options.styleId)) errors.push(`--style must be custom or one of ${STYLE_IDS.join(', ')}`);
  if (options.title !== undefined && (!options.title.trim() || /[\r\n`$\\]/.test(options.title))) errors.push('--title must be a single line without backticks, "$", or backslashes');
  return errors;
};

const json = (value: unknown) => JSON.stringify(value);

export type ScaffoldSceneSpec = {id: string; title: string; durationInFrames: number; transitionInFrames?: number};

/**
 * Default scene plan: opening, main idea, and closing joined by short declared transitions whose
 * overlaps add up exactly to the requested duration. Very short projects get a single scene.
 */
export const planScenes = (durationInFrames: number): ScaffoldSceneSpec[] => {
  if (durationInFrames < 45) return [{id: 'opening', title: 'Opening', durationInFrames}];
  const transition = Math.min(12, Math.floor(durationInFrames / 10));
  const share = Math.floor((durationInFrames + transition * 2) / 3);
  return [
    {id: 'opening', title: 'Opening', durationInFrames: share},
    {id: 'main', title: 'Main idea', durationInFrames: share, transitionInFrames: transition},
    {id: 'closing', title: 'Closing', durationInFrames: durationInFrames + transition * 2 - share * 2, transitionInFrames: transition},
  ];
};

export const planScaffold = (options: ScaffoldOptions): ScaffoldPlan => {
  const errors = validateScaffoldOptions(options);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const {id} = options;
  const title = options.title?.trim() ?? titleCase(id);
  const language = options.language ?? 'ar';
  const direction = language === 'en' ? 'ltr' : 'rtl';
  const formats = options.formats ?? ['vertical'];
  const fps = options.fps ?? 30;
  const durationInFrames = Math.round((options.durationSeconds ?? 10) * fps);
  const styleId = options.styleId ?? 'custom';
  const component = `${pascal(id)}Composition`;
  const meta = `${camel(id)}Meta`;
  const propsType = `${pascal(id)}Props`;
  const compositionIds = compositionIdsFor(id, formats);
  const sceneSpecs = planScenes(durationInFrames);
  // Computed here as well so the docs show the same frames the contract will validate.
  const scenes = defineScenes(sceneSpecs);
  const scenesConst = `${camel(id)}Scenes`;

  const projectTs = `import {defineProject, defineScenes} from '../contract';

export type ${propsType} = {headline: string};

/** Scene frames are computed from durations and declared transitions; edit durations, not frames. */
export const ${scenesConst} = defineScenes([
${sceneSpecs.map((scene) => `  {id: ${json(scene.id)}, title: ${json(scene.title)}, durationInFrames: ${scene.durationInFrames}${scene.transitionInFrames ? `, transitionInFrames: ${scene.transitionInFrames}` : ''}},`).join('\n')}
]);

/** Generated by \`npm run project:new\`. Edit freely; \`npm run projects:validate\` checks it. */
export const ${meta} = defineProject<${propsType}>({
  id: ${json(id)},
  title: ${json(title)},
  summary: ${json(`Draft project scaffolded on ${new Date().toISOString().slice(0, 10)}; replace with the one-sentence idea.`)},
  kind: 'production',
  language: ${json(language)},
  direction: ${json(direction)},
  fps: ${fps},
  durationInFrames: ${durationInFrames},
  compositions: [
${compositionIds.map((compositionId, index) => `    {id: ${json(compositionId)}, format: ${json(formats[index])}},`).join('\n')}
  ],
  styleId: ${json(styleId)},
  scenes: ${scenesConst},
  fonts: ['display', 'text'],
  assets: [],
  defaultProps: {headline: ${json(title)}},
  editableProps: ['headline'],
  docsPath: ${json(`projects/${id}`)},
  status: {stage: 'draft'},
});
`;

  // A named style generates that style's scene components (title, explainer beats, end card);
  // `custom` keeps the neutral SceneCopy scaffold.
  const styledComponentTsx = `import type {FC} from 'react';
import {AbsoluteFill} from 'remotion';
import {SceneTimeline} from '../../motion/scenes';
import {StyleScene, getStyleTheme, styleSceneRoleFor} from '../../motion/styles/templates';
import type {StyleSceneRole} from '../../motion/styles/templates';
import {projectTimeline} from '../contract';
import {${meta}} from './project';
import type {${propsType}} from './project';

const timeline = projectTimeline(${meta});

/** Placeholder copy for the scenes after the opening; replace it with the beats in projects/${id}/SCENES.md. */
const sceneCopy: Record<Exclude<StyleSceneRole, 'title'>, string> = {
  explainer: ${json(language === 'en' ? 'Main idea' : 'الفكرة الأساسية')},
  'end-card': ${json(language === 'en' ? 'Key takeaway' : 'الخلاصة')},
};

/**
 * Starting point generated by \`npm run project:new --style ${styleId}\`: the ${styleId} style's
 * scene templates on one <SceneTimeline> over the scenes in project.ts, joined by fades.
 */
export const ${component}: FC<${propsType}> = ({headline}) => (
  <AbsoluteFill style={{background: getStyleTheme(${json(styleId)}).background}}>
    <SceneTimeline scenes={timeline} durationInFrames={${meta}.durationInFrames} transition="fade" direction={${meta}.direction}>
      {(_scene, index) => {
        const role = styleSceneRoleFor(index, timeline.length);
        return <StyleScene styleId={${json(styleId)}} role={role} text={role === 'title' ? headline : sceneCopy[role]} direction={${meta}.direction} />;
      }}
    </SceneTimeline>
  </AbsoluteFill>
);
`;

  const componentTsx = styleId !== 'custom' ? styledComponentTsx : `import type {FC} from 'react';
import {AbsoluteFill} from 'remotion';
import {ease, progress, useCanvas} from '../../motion/core';
import {SceneTimeline, useScene} from '../../motion/scenes';
import {FittedText} from '../../motion/typography';
import {projectTimeline} from '../contract';
import {${meta}} from './project';
import type {${propsType}} from './project';

const timeline = projectTimeline(${meta});

/** One scene's copy, entering with its scene inside the title-safe area. */
const SceneCopy: FC<{text: string; level: 'display' | 'heading'}> = ({text, level}) => {
  const {localFrame} = useScene();
  const {safeRect} = useCanvas();
  const enter = progress(localFrame, 0, 18, ease.snap);
  return (
    <div style={{position: 'absolute', left: safeRect.x, top: safeRect.y, opacity: enter, translate: \`0 \${(1 - enter) * 24}px\`}}>
      <FittedText text={text} box={{width: safeRect.width, height: safeRect.height}} level={level} direction={${meta}.direction} align="center" verticalAlign="center" />
    </div>
  );
};

/**
 * Starting point generated by \`npm run project:new\`: one <SceneTimeline> over the scenes in
 * project.ts, joined by fades. Replace each scene's content with the beats in projects/${id}/SCENES.md.
 */
export const ${component}: FC<${propsType}> = ({headline}) => (
  <AbsoluteFill style={{background: '#10131a', color: '#f5f1e8'}}>
    <SceneTimeline scenes={timeline} durationInFrames={${meta}.durationInFrames} transition="fade" direction={${meta}.direction}>
      {(_scene, index) => <SceneCopy text={index === 0 ? headline : ${meta}.scenes[index].title} level={index === 0 ? 'display' : 'heading'} />}
    </SceneTimeline>
  </AbsoluteFill>
);
`;

  const doc = (heading: string, body: string) => `# ${title} — ${heading}\n\n${body}\n`;
  const files: ScaffoldFile[] = [
    {path: `projects/${id}/SCRIPT.md`, content: doc('Script', 'Status: draft.\n\nWrite the spoken or on-screen script here, one line per beat. Keep Arabic words whole; choose Western or Arabic-Indic numerals once.')},
    {path: `projects/${id}/STYLE.md`, content: doc('Style', `Status: draft.\n\nStyle: \`${styleId}\`. Language: \`${language}\` (${direction}). Formats: ${formats.join(', ')} at ${fps} fps.\n\nRecord the visual direction, palette, typography roles, and motion language here.`)},
    {path: `projects/${id}/SCENES.md`, content: doc('Scenes', `Status: draft.\n\n| Scene | Frames | Transition in | Review at |\n|---|---|---|---|\n${scenes.map((scene) => `| ${scene.title} | ${scene.from}–${scene.from + scene.durationInFrames - 1} | ${scene.transitionInFrames ? `${scene.transitionInFrames}-frame fade` : '—'} | frame ${scene.reviewFrame} |`).join('\n')}\n\nKeep this table in sync with \`${scenesConst}\` in \`src/projects/${id}/project.ts\`; frames are computed there from durations and transitions.`)},
    {path: `src/projects/${id}/project.ts`, content: projectTs},
    {path: `src/projects/${id}/${component}.tsx`, content: componentTsx},
  ];

  return {
    id,
    title,
    compositionIds,
    files,
    directories: [`projects/${id}`, `src/projects/${id}`],
    registryImport: `import {${meta}} from './${id}/project';`,
    registryEntry: `  register(${meta}, () => import('./${id}/${component}').then((module) => ({default: module.${component}}))),`,
  };
};

/** Inserts the plan's import and entry above the scaffold markers; throws if a marker is missing. */
export const addToRegistry = (source: string, plan: ScaffoldPlan) => {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const importAt = lines.findIndex((line) => line.startsWith(REGISTRY_IMPORT_MARKER));
  const entryAt = lines.findIndex((line) => line.startsWith(REGISTRY_ENTRY_MARKER));
  if (importAt < 0 || entryAt < 0) {
    throw new Error(`${REGISTRY_PATH} is missing the "project:new" marker comments; restore them before scaffolding.`);
  }
  if (lines.includes(plan.registryImport) || lines.includes(plan.registryEntry)) {
    throw new Error(`${REGISTRY_PATH} already references "${plan.id}".`);
  }
  lines.splice(entryAt, 0, plan.registryEntry);
  lines.splice(importAt, 0, plan.registryImport);
  return lines.join(eol);
};
