import {existsSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {STYLE_IDS, defineProject, validateProject, validateRegistry} from '../projects/contract';
import type {ProjectDefinition} from '../projects/contract';
import {getProject, projectRegistry, projectsOfKind} from '../projects/registry';
import {styleDefinitions} from '../motion/styles';
import {focusDoodleProject} from '../projects/focus-doodle/timeline';

const valid: ProjectDefinition = {
  id: 'sample-reel',
  title: 'Sample reel',
  summary: 'Contract test project.',
  kind: 'production',
  language: 'ar',
  direction: 'rtl',
  fps: 30,
  durationInFrames: 300,
  compositions: [{id: 'Sample-Reel-Vertical', format: 'vertical'}],
  styleId: 'doodle',
  scenes: [
    {id: 'hook', title: 'Hook', from: 0, durationInFrames: 90, reviewFrame: 45},
    {id: 'body', title: 'Body', from: 90, durationInFrames: 210},
  ],
  fonts: ['display', 'text'],
  assets: [{id: 'logo', path: 'user-assets/logo.png', kind: 'image', license: 'Owner-made'}],
  defaultProps: {headline: 'ركّز'},
  editableProps: ['headline'],
  docsPath: 'projects/sample-reel',
  status: {stage: 'draft'},
};

const errorsOf = (overrides: Partial<ProjectDefinition>) =>
  validateProject({...valid, ...overrides}).filter((issue) => issue.severity === 'error').map((issue) => issue.path);

describe('project contract', () => {
  it('accepts a complete project', () => {
    expect(validateProject(valid)).toEqual([]);
    expect(defineProject(valid)).toBe(valid);
    expect(Object.isFrozen(valid)).toBe(true);
  });

  it('rejects malformed identity, timing, and direction', () => {
    expect(errorsOf({id: 'Sample Reel'})).toContain('id');
    expect(errorsOf({fps: 0})).toContain('fps');
    expect(errorsOf({fps: 29.97})).toContain('fps');
    expect(errorsOf({durationInFrames: -1})).toContain('durationInFrames');
    expect(errorsOf({direction: 'ltr'})).toContain('direction');
    expect(errorsOf({language: 'en'})).toContain('direction');
    expect(errorsOf({styleId: 'neon' as never})).toContain('styleId');
  });

  it('rejects bad compositions and scenes', () => {
    expect(errorsOf({compositions: []})).toContain('compositions');
    expect(errorsOf({compositions: [{id: 'Bad id!', format: 'vertical'}]})).toContain('compositions[0].id');
    expect(errorsOf({compositions: [{id: 'A', format: 'vertical'}, {id: 'A', format: 'square'}]})).toContain('compositions[1].id');
    expect(errorsOf({compositions: [{id: 'A', format: 'cinema' as never}]})).toContain('compositions[0].format');
    expect(errorsOf({scenes: []})).toContain('scenes');
    expect(errorsOf({scenes: [{id: 'a', title: 'A', from: 0, durationInFrames: 400}]})).toContain('scenes[0]');
    expect(errorsOf({scenes: [{id: 'a', title: 'A', from: 50, durationInFrames: 50}, {id: 'b', title: 'B', from: 10, durationInFrames: 20}]})).toContain('scenes[1]');
    expect(errorsOf({scenes: [{id: 'a', title: 'A', from: 0, durationInFrames: 50, reviewFrame: 80}]})).toContain('scenes[0].reviewFrame');
  });

  it('protects assets, props, and production docs', () => {
    expect(errorsOf({assets: [{id: 'x', path: '../secret.mp4', kind: 'video', license: 'x'}]})).toContain('assets[0].path');
    expect(errorsOf({assets: [{id: 'x', path: 'C:/Users/me/a.png', kind: 'image', license: 'x'}]})).toContain('assets[0].path');
    expect(errorsOf({assets: [{id: 'x', path: 'reference/user/clip.mp4', kind: 'video', license: 'x'}]})).toContain('assets[0].path');
    expect(errorsOf({assets: [{id: 'x', path: 'a.png', kind: 'image', license: ' '}]})).toContain('assets[0].license');
    expect(errorsOf({editableProps: ['missing']})).toContain('editableProps');
    expect(errorsOf({docsPath: undefined})).toContain('docsPath');
    expect(errorsOf({fonts: ['serif' as never]})).toContain('fonts[0]');
    expect(() => defineProject({...valid, id: 'BAD'})).toThrow(/Invalid project "BAD"/);
  });

  it('warns when a production relies on system fonts', () => {
    expect(validateProject({...valid, fonts: []})).toEqual([
      expect.objectContaining({severity: 'warning', path: 'fonts'}),
    ]);
  });

  it('detects duplicate projects and compositions across the registry', () => {
    const copy = {...valid, id: 'sample-copy'};
    expect(validateRegistry([valid, copy]).map((issue) => issue.message)).toContain('composition "Sample-Reel-Vertical" is registered twice');
    expect(validateRegistry([valid, valid]).map((issue) => issue.message)).toContain('duplicate project id');
  });
});

describe('project registry', () => {
  it('is valid and keeps style ids in sync with the style catalog', () => {
    expect(validateRegistry(projectRegistry.map((entry) => entry.meta)).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect([...STYLE_IDS].sort()).toEqual(styleDefinitions.map((style) => style.id).sort());
  });

  it('preserves the Focus Doodle production exactly as registered before', () => {
    const {meta} = getProject('focus-doodle');
    expect(meta.compositions).toEqual([{id: 'Focus-Doodle-Vertical', format: 'vertical'}]);
    expect(meta.durationInFrames).toBe(900);
    expect(meta.fps).toBe(30);
    expect(meta.scenes.map((scene) => [scene.from, scene.durationInFrames])).toEqual(focusDoodleProject.beats.map((beat) => [beat.from, beat.durationInFrames]));
    expect(meta.status.stage).not.toBe('owner-accepted');
  });

  it('registers typography fixtures in all three formats', () => {
    const ids = projectsOfKind('fixture').flatMap((entry) => entry.meta.compositions.map((item) => item.id));
    for (const sheet of ['Specimens', 'Motion', 'Bidi']) {
      for (const format of ['Horizontal', 'Vertical', 'Square']) expect(ids).toContain(`QA-Typography-${sheet}-${format}`);
    }
  });

  it('keeps production docs on disk and loads every component lazily', async () => {
    for (const {meta, load} of projectRegistry) {
      if (meta.docsPath) {
        for (const file of ['SCRIPT.md', 'STYLE.md', 'SCENES.md']) expect(existsSync(path.resolve(meta.docsPath, file)), `${meta.docsPath}/${file}`).toBe(true);
      }
      const module = await load();
      expect(typeof module.default).toBe('function');
    }
    expect(() => getProject('missing')).toThrow(/Unknown project/);
  });
});
