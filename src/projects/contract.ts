import type {ComponentType} from 'react';
import {compositionFormats} from '../motion/formats';
import type {CompositionFormat} from '../motion/formats';
import {sequenceScenes, validateSceneLayout} from '../motion/core/timeline';
import type {Scene, SceneSpec} from '../motion/core/timeline';
import type {FontRole} from '../motion/typography/fonts';
import {ASSET_ID_PATTERN} from '../motion/media/manifest';
import type {TextDirection} from '../motion/types';

// The project contract: what a video or fixture is, where it lives, and how it is registered.
// React components draw and animate; everything an agent needs to find, register, or validate a
// project lives in this plain, serialisable shape. See .agents/skills/motion-engineering.

export const STYLE_IDS = ['plotter', 'doodle', 'whiteboard', 'chalkboard'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const FONT_ROLES = ['display', 'text'] as const satisfies readonly FontRole[];

export type ProjectKind = 'production' | 'fixture';
/** Agents may move a project up to "review-ready". Only the owner sets "owner-accepted". */
export type ProjectStage = 'draft' | 'in-progress' | 'review-ready' | 'owner-accepted';
export type ProjectLanguage = 'ar' | 'en' | 'ar-en';

export type ProjectComposition = {id: string; format: CompositionFormat};

export type ProjectScene = {
  id: string;
  title: string;
  from: number;
  durationInFrames: number;
  /**
   * Frames this scene overlaps the previous one, where the transition plays. Overlaps must be
   * declared here; see validateSceneLayout in src/motion/core/timeline.ts for the shared rules.
   */
  transitionInFrames?: number;
  /** Frame the owner should check; it must fall where this scene is alone on screen. */
  reviewFrame?: number;
};

export type ProjectAsset = {
  id: string;
  /** Path relative to public/, as passed to staticFile(). */
  path: string;
  kind: 'image' | 'audio' | 'video' | 'font' | 'data';
  license: string;
};

/**
 * Owner media this project uses, by asset id in its git-ignored manifest
 * (public/user-assets/<id>/assets.json, written by npm run asset:import). Ids only: the files and
 * their metadata stay private and out of Git, and a missing one is reported, never substituted.
 */
export type ProjectMedia = {
  assets: readonly string[];
  /** The narration that drives timing, when there is one; must be listed in assets. */
  voiceover?: string;
  /** Frame the voiceover starts at (its VoiceoverTrack `from`); used to check it fits. */
  voiceoverFrom?: number;
};

export type ProjectStatus = {
  stage: ProjectStage;
  /** ISO date of the last verification recorded in STATUS.md. */
  lastVerified?: string;
  notes?: string;
};

export type ProjectProps = Record<string, unknown>;

export type ProjectDefinition<Props extends ProjectProps = ProjectProps> = {
  id: string;
  title: string;
  summary: string;
  kind: ProjectKind;
  language: ProjectLanguage;
  direction: TextDirection;
  fps: number;
  durationInFrames: number;
  compositions: readonly ProjectComposition[];
  styleId: StyleId | 'custom';
  scenes: readonly ProjectScene[];
  fonts: readonly FontRole[];
  assets: readonly ProjectAsset[];
  media?: ProjectMedia;
  defaultProps: Props;
  /** Props the library or Studio may change without touching the component. */
  editableProps: readonly (keyof Props & string)[];
  /** Repo-relative folder holding SCRIPT.md / STYLE.md / SCENES.md for productions. */
  docsPath?: string;
  status: ProjectStatus;
};

/** A project plus a lazy loader for its component, so the library only downloads what it shows. */
export type RegisteredProject<Props extends ProjectProps = ProjectProps> = {
  meta: ProjectDefinition<Props>;
  load: () => Promise<{default: ComponentType<Props>}>;
};

export type ProjectIssue = {severity: 'error' | 'warning'; path: string; message: string};

export const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COMPOSITION_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;

export const validateProject = (project: ProjectDefinition): ProjectIssue[] => {
  const issues: ProjectIssue[] = [];
  const error = (path: string, message: string) => issues.push({severity: 'error', path, message});
  const warn = (path: string, message: string) => issues.push({severity: 'warning', path, message});

  if (!PROJECT_ID_PATTERN.test(project.id)) error('id', 'must be kebab-case (a-z, 0-9, single hyphens)');
  if (!project.title.trim()) error('title', 'is required');
  if (!project.summary.trim()) error('summary', 'is required');
  if (!isPositiveInteger(project.fps) || project.fps > 120) error('fps', 'must be an integer between 1 and 120');
  if (!isPositiveInteger(project.durationInFrames)) error('durationInFrames', 'must be a positive integer');

  if (project.language === 'ar' && project.direction !== 'rtl') error('direction', 'Arabic projects must be rtl');
  if (project.language === 'en' && project.direction !== 'ltr') error('direction', 'English projects must be ltr');
  if (project.styleId !== 'custom' && !STYLE_IDS.includes(project.styleId)) error('styleId', `unknown style "${project.styleId}"`);

  if (project.compositions.length === 0) error('compositions', 'needs at least one composition');
  const compositionIds = new Set<string>();
  project.compositions.forEach((composition, index) => {
    const path = `compositions[${index}]`;
    if (!COMPOSITION_ID_PATTERN.test(composition.id)) error(`${path}.id`, 'may only contain letters, digits, and hyphens');
    if (compositionIds.has(composition.id)) error(`${path}.id`, `duplicate composition id "${composition.id}"`);
    compositionIds.add(composition.id);
    if (!(composition.format in compositionFormats)) error(`${path}.format`, `unknown format "${composition.format}"`);
  });

  // Scene layout follows the same rules as sequenceScenes() and <SceneTimeline>: ordered, no
  // gaps, overlaps only as declared transitions, and the last scene ends with the project.
  for (const issue of validateSceneLayout(project.scenes, isPositiveInteger(project.durationInFrames) ? project.durationInFrames : undefined)) {
    if (issue.index < 0) continue;
    error(issue.field ? `scenes[${issue.index}].${issue.field}` : `scenes[${issue.index}]`, issue.message);
  }
  if (project.scenes.length === 0) error('scenes', 'needs at least one scene');

  project.fonts.forEach((role, index) => {
    if (!FONT_ROLES.includes(role)) error(`fonts[${index}]`, `unknown font role "${role}"`);
  });

  project.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (asset.path.startsWith('/') || /^[A-Za-z]:/.test(asset.path) || asset.path.split(/[\\/]/).includes('..')) {
      error(`${path}.path`, 'must be relative to public/ without ".."');
    }
    if (asset.path.startsWith('reference/')) error(`${path}.path`, 'private reference footage must never be a render asset');
    if (!asset.license.trim()) error(`${path}.license`, 'record the license or ownership of every asset');
  });

  if (project.media) {
    const seen = new Set<string>();
    project.media.assets.forEach((id, index) => {
      if (!ASSET_ID_PATTERN.test(id)) error(`media.assets[${index}]`, `"${id}" is not a valid asset id`);
      if (seen.has(id)) error(`media.assets[${index}]`, `duplicate asset id "${id}"`);
      seen.add(id);
    });
    if (project.media.voiceover && !seen.has(project.media.voiceover)) error('media.voiceover', 'must also be listed in media.assets');
    const from = project.media.voiceoverFrom;
    if (from !== undefined && !(Number.isInteger(from) && from >= 0)) error('media.voiceoverFrom', 'must be a non-negative integer frame');
    if (from !== undefined && !project.media.voiceover) error('media.voiceoverFrom', 'needs media.voiceover');
  }

  for (const key of project.editableProps) {
    if (!(key in project.defaultProps)) error('editableProps', `"${key}" has no default value`);
  }

  if (project.kind === 'production') {
    if (!project.docsPath) error('docsPath', 'productions keep their script and specs under projects/<id>/');
    if (project.fonts.length === 0) warn('fonts', 'no bundled font roles declared; text may depend on system fallback fonts');
  }
  return issues;
};

export const validateRegistry = (projects: readonly ProjectDefinition[]): ProjectIssue[] => {
  const issues = projects.flatMap((project) =>
    validateProject(project).map((issue) => ({...issue, path: `${project.id}.${issue.path}`})),
  );
  const ids = new Set<string>();
  const compositions = new Set<string>();
  for (const project of projects) {
    if (ids.has(project.id)) issues.push({severity: 'error', path: project.id, message: 'duplicate project id'});
    ids.add(project.id);
    for (const composition of project.compositions) {
      if (compositions.has(composition.id)) {
        issues.push({severity: 'error', path: `${project.id}.compositions`, message: `composition "${composition.id}" is registered twice`});
      }
      compositions.add(composition.id);
    }
  }
  return issues;
};

/** Validates at definition time so a broken project fails on import, not in the middle of a review. */
export const defineProject = <Props extends ProjectProps>(project: ProjectDefinition<Props>): ProjectDefinition<Props> => {
  const errors = validateProject(project as ProjectDefinition).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Invalid project "${project.id}":\n${errors.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')}`);
  }
  return Object.freeze(project);
};

export const formatDimensions = (format: CompositionFormat) => compositionFormats[format];

/** The project's scenes as a motion-core timeline, for <SceneTimeline> and timing helpers. */
export const projectTimeline = (project: {readonly scenes: readonly ProjectScene[]}): Scene[] =>
  project.scenes.map(({id, from, durationInFrames, transitionInFrames}) => ({id, from, durationInFrames, transitionInFrames: transitionInFrames ?? 0}));

/**
 * Builds contract scenes from durations and transitions with sequenceScenes(), so the frames in
 * project metadata are computed rather than typed by hand. Review frames default to the middle of
 * each scene's sole-owner window.
 */
export const defineScenes = (specs: readonly (SceneSpec & {title: string; reviewFrame?: number})[]): ProjectScene[] => {
  const scenes = sequenceScenes(specs);
  return scenes.map((scene, index) => {
    const next = scenes[index + 1];
    const soleFrom = scene.from + (scene.transitionInFrames ?? 0);
    const soleTo = scene.from + scene.durationInFrames - (next?.transitionInFrames ?? 0);
    return {
      id: scene.id,
      title: specs[index].title,
      from: scene.from,
      durationInFrames: scene.durationInFrames,
      ...(scene.transitionInFrames ? {transitionInFrames: scene.transitionInFrames} : {}),
      reviewFrame: specs[index].reviewFrame ?? Math.floor((soleFrom + soleTo) / 2),
    };
  });
};
