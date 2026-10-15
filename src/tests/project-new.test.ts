import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {REGISTRY_PATH, addToRegistry, compositionIdsFor, planScaffold, planScenes, validateScaffoldOptions} from '../projects/scaffold';
import {STYLE_IDS, defineScenes} from '../projects/contract';
import {timelineDuration, validateSceneLayout} from '../motion/core';
import {applyScaffold, nodeFileSystem, parseCli, resolveInside} from '../../scripts/project-new';
import type {FileSystem} from '../../scripts/project-new';

const repo = path.resolve('.');
const tsx = path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');

describe('project:new planning', () => {
  it('rejects unsafe or invalid identifiers', () => {
    for (const id of ['../evil', 'a/b', 'a\\b', 'Bad-Id', 'my reel', 'my--reel', '-reel', 'reel-', '3d-intro', 'x', 'con', 'registry', 'a'.repeat(49), '.hidden', 'reel.v2']) {
      expect(validateScaffoldOptions({id}), id).not.toEqual([]);
    }
    expect(validateScaffoldOptions({id: 'ramadan-reel-2026'})).toEqual([]);
  });

  it('rejects duplicate projects and compositions and bad options', () => {
    const existing = {projectIds: ['focus-doodle'], compositionIds: ['Focus-Doodle-Vertical', 'Promo-Square']};
    expect(validateScaffoldOptions({id: 'focus-doodle'}, existing).join()).toMatch(/already registered/);
    expect(validateScaffoldOptions({id: 'promo', formats: ['square']}, existing).join()).toMatch(/Promo-Square" is already registered/);
    expect(validateScaffoldOptions({id: 'promo', formats: []}).join()).toMatch(/at least one/);
    expect(validateScaffoldOptions({id: 'promo', formats: ['vertical', 'vertical']}).join()).toMatch(/twice/);
    expect(validateScaffoldOptions({id: 'promo', formats: ['cinema' as never]}).join()).toMatch(/unknown --format/);
    expect(validateScaffoldOptions({id: 'promo', fps: 29.97}).join()).toMatch(/--fps/);
    expect(validateScaffoldOptions({id: 'promo', durationSeconds: 0}).join()).toMatch(/--duration/);
    expect(validateScaffoldOptions({id: 'promo', language: 'fr' as never}).join()).toMatch(/--language/);
    expect(validateScaffoldOptions({id: 'promo', title: 'a`b'}).join()).toMatch(/--title/);
  });

  it('plans POSIX paths under projects/<id> and src/projects/<id> only', () => {
    const plan = planScaffold({id: 'ramadan-reel', formats: ['vertical', 'square'], language: 'en', fps: 25, durationSeconds: 8});
    expect(plan.compositionIds).toEqual(compositionIdsFor('ramadan-reel', ['vertical', 'square']));
    expect(plan.compositionIds).toEqual(['Ramadan-Reel-Vertical', 'Ramadan-Reel-Square']);
    for (const file of plan.files) expect(file.path).toMatch(/^(projects|src\/projects)\/ramadan-reel\/[A-Za-z]+\.(md|ts|tsx)$/);
    const project = plan.files.find((file) => file.path.endsWith('project.ts'))!.content;
    expect(project).toContain("direction: \"ltr\"");
    expect(project).toContain('durationInFrames: 200');
    expect(project).toContain("status: {stage: 'draft'}");
    expect(() => resolveInside(repo, '../outside.txt')).toThrow(/outside/);
  });

  it('edits the registry only at its markers and refuses repeats or missing markers', () => {
    const plan = planScaffold({id: 'ramadan-reel'});
    const source = readFileSync(path.join(repo, REGISTRY_PATH), 'utf8');
    const edited = addToRegistry(source, plan);
    expect(edited.indexOf(plan.registryImport)).toBeLessThan(edited.indexOf('// project:new imports'));
    expect(edited.indexOf(plan.registryEntry)).toBeLessThan(edited.indexOf('// project:new entries'));
    expect(edited.split(/\r?\n/).length).toBe(source.split(/\r?\n/).length + 2);
    expect(() => addToRegistry(edited, plan)).toThrow(/already references/);
    expect(() => addToRegistry(source.replace('// project:new entries', '// gone'), plan)).toThrow(/marker/);
  });

  it('plans gap-free scenes whose transitions add up exactly to the duration', () => {
    for (const duration of [45, 46, 90, 150, 299, 300, 301, 450, 1800, 18000]) {
      const specs = planScenes(duration);
      expect(specs.map((spec) => spec.id), String(duration)).toEqual(['opening', 'main', 'closing']);
      const scenes = defineScenes(specs);
      expect(timelineDuration(scenes), String(duration)).toBe(duration);
      expect(validateSceneLayout(scenes, duration), String(duration)).toEqual([]);
      expect(scenes.slice(1).every((scene) => (scene.transitionInFrames ?? 0) > 0)).toBe(true);
    }
    for (const duration of [1, 12, 44]) {
      expect(planScenes(duration), String(duration)).toEqual([{id: 'opening', title: 'Opening', durationInFrames: duration}]);
    }
  });

  it('generates the scene architecture: defineScenes in project.ts and <SceneTimeline> in the component', () => {
    const plan = planScaffold({id: 'scene-reel', durationSeconds: 6});
    const project = plan.files.find((file) => file.path.endsWith('project.ts'))!.content;
    const component = plan.files.find((file) => file.path.endsWith('Composition.tsx'))!.content;
    const scenesDoc = plan.files.find((file) => file.path.endsWith('SCENES.md'))!.content;
    expect(project).toContain('export const sceneReelScenes = defineScenes([');
    expect(project).toContain("{id: \"main\", title: \"Main idea\", durationInFrames: 68, transitionInFrames: 12},");
    expect(project).toContain('scenes: sceneReelScenes,');
    expect(component).toContain('<SceneTimeline scenes={timeline} durationInFrames={sceneReelMeta.durationInFrames} transition="fade" direction={sceneReelMeta.direction}>');
    expect(component).toContain('const timeline = projectTimeline(sceneReelMeta);');
    expect(scenesDoc).toContain('| Main idea | 56–123 | 12-frame fade | frame');
  });

  it('parses CLI options', () => {
    expect(parseCli(['--id', 'promo', '--format', 'vertical, square', '--fps', '25', '--duration', '12', '--dry-run'])).toMatchObject({
      id: 'promo',
      formats: ['vertical', 'square'],
      fps: 25,
      durationSeconds: 12,
      dryRun: true,
    });
    expect(() => parseCli([])).toThrow(/--id is required/);
    expect(() => parseCli(['--id', 'x', '--unknown'])).toThrow();
  });
});

describe('project:new in an isolated workspace', () => {
  let workspace: string;
  const run = (args: string[]) => spawnSync(process.execPath, [tsx, path.join(repo, 'scripts', 'project-new.ts'), ...args, '--root', workspace], {encoding: 'utf8', cwd: repo});
  const registry = () => readFileSync(path.join(workspace, REGISTRY_PATH), 'utf8');

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'abud-project-new-'));
    for (const entry of ['src', 'scripts', 'projects', 'tsconfig.json', 'package.json']) cpSync(path.join(repo, entry), path.join(workspace, entry), {recursive: true});
    symlinkSync(path.join(repo, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
  });

  afterAll(() => {
    if (!workspace) return;
    // Remove the junction itself first and never recurse through it into the real node_modules.
    const link = path.join(workspace, 'node_modules');
    try {
      unlinkSync(link);
    } catch {
      rmdirSync(link);
    }
    const linkGone = (() => {
      try {
        lstatSync(link);
        return false;
      } catch {
        return true;
      }
    })();
    if (linkGone) rmSync(workspace, {recursive: true, force: true});
  });

  it('dry-run reports the plan and writes nothing', () => {
    const before = registry();
    const result = run(['--id', 'demo-reel', '--dry-run']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Nothing was written.');
    expect(existsSync(path.join(workspace, 'projects', 'demo-reel'))).toBe(false);
    expect(registry()).toBe(before);
  });

  it('generates a project that registers, typechecks, and validates', () => {
    const result = run(['--id', 'demo-reel', '--title', 'Demo reel', '--format', 'vertical,square', '--fps', '30', '--duration', '6']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Demo-Reel-Vertical, Demo-Reel-Square');
    expect(result.stdout).toMatch(/Never export/);
    for (const file of ['projects/demo-reel/SCRIPT.md', 'projects/demo-reel/STYLE.md', 'projects/demo-reel/SCENES.md', 'src/projects/demo-reel/project.ts', 'src/projects/demo-reel/DemoReelComposition.tsx']) {
      expect(existsSync(path.join(workspace, ...file.split('/'))), file).toBe(true);
    }
    expect(registry()).toContain("import {demoReelMeta} from './demo-reel/project';");
    expect(registry()).toContain('register(demoReelMeta,');
    const component = readFileSync(path.join(workspace, 'src', 'projects', 'demo-reel', 'DemoReelComposition.tsx'), 'utf8');
    expect(component).toContain('<SceneTimeline');
    expect(readFileSync(path.join(workspace, 'src', 'projects', 'demo-reel', 'project.ts'), 'utf8')).toContain('defineScenes([');

    const typecheck = spawnSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', path.join(workspace, 'tsconfig.json')], {encoding: 'utf8'});
    expect(typecheck.status, typecheck.stdout + typecheck.stderr).toBe(0);

    const validate = spawnSync(process.execPath, [tsx, 'scripts/validate-projects.ts'], {encoding: 'utf8', cwd: workspace});
    expect(validate.status, validate.stdout + validate.stderr).toBe(0);
    expect(validate.stdout).toMatch(/production\s+demo-reel\s+draft\s+Demo-Reel-Vertical, Demo-Reel-Square/);
    expect(validate.stdout).toMatch(/0 errors/);
  }, 60_000);

  it('generates one project per named style that registers, typechecks, and validates', () => {
    for (const style of STYLE_IDS) {
      const result = run(['--id', `${style}-style-reel`, '--style', style, '--language', style === 'plotter' ? 'en' : 'ar', '--format', 'vertical,square', '--duration', '8']);
      expect(result.status, result.stderr).toBe(0);
      const component = readFileSync(path.join(workspace, 'src', 'projects', `${style}-style-reel`, `${style[0].toUpperCase()}${style.slice(1)}StyleReelComposition.tsx`), 'utf8');
      expect(component).toContain(`<StyleScene styleId={"${style}"}`);
      expect(registry()).toContain(`register(${style}StyleReelMeta,`);
    }
    const typecheck = spawnSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', path.join(workspace, 'tsconfig.json')], {encoding: 'utf8'});
    expect(typecheck.status, typecheck.stdout + typecheck.stderr).toBe(0);
    const validate = spawnSync(process.execPath, [tsx, 'scripts/validate-projects.ts'], {encoding: 'utf8', cwd: workspace});
    expect(validate.status, validate.stdout + validate.stderr).toBe(0);
    for (const style of STYLE_IDS) expect(validate.stdout).toMatch(new RegExp(`production\\s+${style}-style-reel\\s+draft`));
    expect(validate.stdout).toMatch(/0 errors/);
  }, 90_000);

  it('rejects a duplicate id without touching anything', () => {
    const before = registry();
    const result = run(['--id', 'demo-reel']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/already registered/);
    expect(registry()).toBe(before);
  });

  it('rejects invalid ids and leaves the workspace unchanged', () => {
    const before = registry();
    for (const id of ['../escape', 'Bad', 'a/b']) {
      const result = run(['--id', id]);
      expect(result.status, id).toBe(1);
      expect(result.stderr).toMatch(/kebab-case/);
    }
    expect(existsSync(path.join(workspace, '..', 'escape'))).toBe(false);
    expect(registry()).toBe(before);
  });

  it('refuses to overwrite an existing file and creates nothing else', () => {
    const before = registry();
    mkdirSync(path.join(workspace, 'projects', 'taken-reel'), {recursive: true});
    writeFileSync(path.join(workspace, 'projects', 'taken-reel', 'SCRIPT.md'), 'owner notes');
    const result = run(['--id', 'taken-reel']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing to overwrite/);
    expect(readFileSync(path.join(workspace, 'projects', 'taken-reel', 'SCRIPT.md'), 'utf8')).toBe('owner notes');
    expect(existsSync(path.join(workspace, 'src', 'projects', 'taken-reel'))).toBe(false);
    expect(registry()).toBe(before);
  });

  it('runs when invoked through a differently cased Windows path', () => {
    const script = path.join(repo, 'scripts', 'project-new.ts');
    const cased = process.platform === 'win32' ? script[0].toLowerCase() + script.slice(1) : script;
    const result = spawnSync(process.execPath, [tsx, cased, '--id', 'case-reel', '--dry-run', '--root', workspace], {encoding: 'utf8', cwd: repo});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Nothing was written.');
  });

  it('removes parent directories it created when rolling back', () => {
    const docs = path.join(workspace, 'projects');
    const moved = path.join(workspace, 'projects-moved');
    renameSync(docs, moved);
    try {
      let writes = 0;
      const failing: FileSystem = {
        ...nodeFileSystem,
        writeNew: (file, content) => {
          writes += 1;
          if (writes === 2) throw new Error('disk full');
          nodeFileSystem.writeNew(file, content);
        },
      };
      expect(() => applyScaffold(workspace, planScaffold({id: 'orphan-reel'}), failing)).toThrow(/rolled back/);
      expect(existsSync(docs)).toBe(false);
      expect(existsSync(path.join(workspace, 'src', 'projects', 'orphan-reel'))).toBe(false);
    } finally {
      renameSync(moved, docs);
    }
  });

  it('rolls back every created file and the registry when a write fails midway', () => {
    const before = registry();
    let writes = 0;
    const failing: FileSystem = {
      ...nodeFileSystem,
      writeNew: (file, content) => {
        writes += 1;
        if (writes === 4) throw new Error('disk full');
        nodeFileSystem.writeNew(file, content);
      },
    };
    expect(() => applyScaffold(workspace, planScaffold({id: 'broken-reel'}), failing)).toThrow(/rolled back: disk full/);
    expect(existsSync(path.join(workspace, 'projects', 'broken-reel'))).toBe(false);
    expect(existsSync(path.join(workspace, 'src', 'projects', 'broken-reel'))).toBe(false);
    expect(registry()).toBe(before);
  });
});
