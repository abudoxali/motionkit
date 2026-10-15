// npm run project:new -- --id my-reel [--title "..."] [--language ar|en|ar-en]
//   [--format vertical,square] [--fps 30] [--duration 15] [--style doodle] [--dry-run]
//
// Scaffolds docs, a typed project definition, and a minimal component, then registers the project.
// All-or-nothing: every target is checked before anything is written, files are created with
// exclusive flags, and any failure removes what was created and restores the registry.
// It never renders or exports video.
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import type {CompositionFormat} from '../src/motion/formats';
import type {ProjectLanguage, RegisteredProject, StyleId} from '../src/projects/contract';
import {REGISTRY_PATH, addToRegistry, planScaffold, validateScaffoldOptions} from '../src/projects/scaffold';
import type {ScaffoldOptions, ScaffoldPlan} from '../src/projects/scaffold';

export type FileSystem = {
  exists: (file: string) => boolean;
  read: (file: string) => string;
  /** Must fail if the file already exists. */
  writeNew: (file: string, content: string) => void;
  overwrite: (file: string, content: string) => void;
  mkdir: (dir: string) => void;
  remove: (target: string) => void;
};

export const nodeFileSystem: FileSystem = {
  exists: existsSync,
  read: (file) => readFileSync(file, 'utf8'),
  writeNew: (file, content) => writeFileSync(file, content, {flag: 'wx'}),
  overwrite: (file, content) => writeFileSync(file, content),
  mkdir: (dir) => mkdirSync(dir, {recursive: true}),
  remove: (target) => rmSync(target, {recursive: true, force: true}),
};

/** Resolves a plan path under root, refusing anything that escapes it. */
export const resolveInside = (root: string, relative: string) => {
  const target = path.resolve(root, ...relative.split('/'));
  const fromRoot = path.relative(root, target);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw new Error(`Refusing to write outside the project: ${relative}`);
  return target;
};

/** Writes the plan atomically. Returns created repo-relative paths. */
export const applyScaffold = (root: string, plan: ScaffoldPlan, fs: FileSystem = nodeFileSystem) => {
  const registryFile = resolveInside(root, REGISTRY_PATH);
  const conflicts = [...plan.directories, ...plan.files.map((file) => file.path)].filter((relative) => fs.exists(resolveInside(root, relative)));
  if (conflicts.length > 0) throw new Error(`Refusing to overwrite existing paths:\n  ${conflicts.join('\n  ')}`);

  const registryBefore = fs.read(registryFile);
  const registryAfter = addToRegistry(registryBefore, plan);
  const createdDirectories: string[] = [];
  const created: string[] = [];
  try {
    for (const directory of plan.directories) {
      // Remember the highest ancestor that did not exist yet, so rollback removes it too.
      const parts = directory.split('/');
      const firstNew = parts.findIndex((_, index) => !fs.exists(resolveInside(root, parts.slice(0, index + 1).join('/'))));
      fs.mkdir(resolveInside(root, directory));
      if (firstNew >= 0) createdDirectories.push(parts.slice(0, firstNew + 1).join('/'));
    }
    for (const file of plan.files) {
      fs.writeNew(resolveInside(root, file.path), file.content);
      created.push(file.path);
    }
    fs.overwrite(registryFile, registryAfter);
  } catch (error) {
    for (const directory of [...createdDirectories].reverse()) fs.remove(resolveInside(root, directory));
    fs.overwrite(registryFile, registryBefore);
    throw new Error(`Scaffold failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`);
  }
  return [...created, REGISTRY_PATH];
};

export const parseCli = (argv: string[]): ScaffoldOptions & {dryRun: boolean; root: string} => {
  const {values} = parseArgs({
    args: argv,
    options: {
      id: {type: 'string'},
      title: {type: 'string'},
      language: {type: 'string'},
      format: {type: 'string'},
      fps: {type: 'string'},
      duration: {type: 'string'},
      style: {type: 'string'},
      'dry-run': {type: 'boolean', default: false},
      root: {type: 'string'},
    },
    strict: true,
  });
  if (!values.id) throw new Error('--id is required, for example: npm run project:new -- --id ramadan-reel');
  return {
    id: values.id,
    title: values.title,
    language: values.language as ProjectLanguage | undefined,
    formats: values.format ? (values.format.split(',').map((item) => item.trim()) as CompositionFormat[]) : undefined,
    fps: values.fps === undefined ? undefined : Number(values.fps),
    durationSeconds: values.duration === undefined ? undefined : Number(values.duration),
    styleId: values.style as StyleId | 'custom' | undefined,
    dryRun: values['dry-run'],
    root: path.resolve(values.root ?? process.cwd()),
  };
};

const loadExisting = async (root: string) => {
  const registryFile = resolveInside(root, REGISTRY_PATH);
  if (!existsSync(registryFile) || !existsSync(path.join(root, 'package.json'))) {
    throw new Error(`${root} is not a MotionKit checkout (missing ${REGISTRY_PATH} or package.json).`);
  }
  const {projectRegistry} = (await import(pathToFileURL(registryFile).href)) as {projectRegistry: readonly RegisteredProject[]};
  return {
    projectIds: projectRegistry.map((entry) => entry.meta.id),
    compositionIds: projectRegistry.flatMap((entry) => entry.meta.compositions.map((item) => item.id)),
  };
};

const main = async () => {
  const options = parseCli(process.argv.slice(2));
  const existing = await loadExisting(options.root);
  const errors = validateScaffoldOptions(options, existing);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const plan = planScaffold(options);

  if (options.dryRun) {
    console.log(`Dry run: would create project "${plan.id}" (${plan.compositionIds.join(', ')})`);
    for (const file of plan.files) console.log(`  + ${file.path}`);
    console.log(`  ~ ${REGISTRY_PATH}`);
    console.log('Nothing was written.');
    return;
  }

  const written = applyScaffold(options.root, plan);
  console.log(`Created project "${plan.id}" with compositions ${plan.compositionIds.join(', ')}:`);
  for (const file of written) console.log(`  ${file === REGISTRY_PATH ? '~' : '+'} ${file}`);
  console.log(`
Next:
  1. Fill in projects/${plan.id}/SCRIPT.md, STYLE.md, and SCENES.md.
  2. Run npm run projects:validate && npm run typecheck.
  3. Preview with npm run studio and open ${plan.compositionIds[0]}. Never export; the owner does that.`);
};

// Windows paths are case-insensitive and drive letters arrive in either case, so compare that way.
const samePath = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const invokedDirectly = Boolean(process.argv[1]) && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`project:new: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
