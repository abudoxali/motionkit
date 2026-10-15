// Project-aware media import. Copies an owner-supplied file into the git-ignored
// public/user-assets/<project>/ folder, verifies the copy, and records it in that project's
// manifest. The source is only ever read; nothing in the project is overwritten.
import {createHash} from 'node:crypto';
import {closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {
  ASSET_ID_PATTERN,
  ASSET_ROLES,
  MANIFEST_VERSION,
  assetFilePath,
  assetIdFromName,
  inferRole,
  isAssetRole,
  kindForExtension,
  manifestPath,
  uniqueAssetId,
  validateManifest,
} from '../../src/motion/media/manifest';
import type {AssetManifest, AssetRecord, AssetRole} from '../../src/motion/media/manifest';
import {PROJECT_ID_PATTERN} from '../../src/projects/contract';
import {AssetError, decodeImage, inspectAudio, inspectJson, inspectText, inspectVideo, parseImageHeader} from './inspect';
import type {Inspection, MediaTools} from './inspect';

export const DEFAULT_LICENSE = 'Owner-supplied; the owner holds or has licensed the rights.';
const MAX_BYTES: Record<string, number> = {image: 200 * 2 ** 20, audio: 1024 * 2 ** 20, video: 8 * 1024 * 2 ** 20, text: 20 * 2 ** 20, data: 50 * 2 ** 20};

/** Resolves a public/-relative path under the checkout, refusing anything that escapes public/. */
export const publicPath = (root: string, relative: string) => {
  const publicDir = path.resolve(root, 'public');
  const target = path.resolve(publicDir, ...relative.split('/'));
  const inside = path.relative(publicDir, target);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new AssetError('unsafe-path', `Refusing a path outside public/: ${relative}`);
  return target;
};

const checkProjectId = (projectId: string, knownProjects: ReadonlySet<string>) => {
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new AssetError('unsafe-path', `"${projectId}" is not a valid project id (kebab-case letters and digits).`);
  if (!knownProjects.has(projectId)) {
    throw new AssetError(
      'unknown-project',
      `No registered project "${projectId}". Assets belong to a project: create it with npm run project:new -- --id ${projectId}, or use one of: ${[...knownProjects].join(', ')}.`,
    );
  }
};

export const emptyManifest = (projectId: string): AssetManifest => ({version: MANIFEST_VERSION, projectId, assets: []});

export const loadManifest = (root: string, projectId: string): AssetManifest => {
  const file = publicPath(root, manifestPath(projectId));
  if (!existsSync(file)) return emptyManifest(projectId);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new AssetError('invalid-manifest', `${manifestPath(projectId)} is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix or restore it; it was not changed.`);
  }
  const errors = validateManifest(value, projectId).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) throw new AssetError('invalid-manifest', `public/${manifestPath(projectId)} is invalid:\n  ${errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n  ')}`);
  return value as AssetManifest;
};

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Replaces a generated file (manifest, timing) through a temporary file and a rename, so a crash
 * never leaves half a file. On Windows the rename fails with EPERM/EBUSY while another process —
 * Studio or the dev server serving the file — has it open, so it retries briefly and then writes
 * the content in place. The temporary file never outlives the call.
 */
export const writeGeneratedFile = (file: string, content: string) => {
  mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, content, {encoding: 'utf8', flag: 'wx'});
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temporary, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
        if (attempt >= 5) break;
        pause(40 * (attempt + 1));
      }
    }
    writeFileSync(file, content, 'utf8');
  } finally {
    rmSync(temporary, {force: true});
  }
};

export const saveManifest = (root: string, manifest: AssetManifest) =>
  writeGeneratedFile(publicPath(root, manifestPath(manifest.projectId)), `${JSON.stringify(manifest, null, 2)}\n`);

/** SHA-256 in 4 MB chunks, so multi-gigabyte footage never has to fit in one buffer. */
export const sha256 = (file: string) => {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(4 * 2 ** 20);
  const fd = openSync(file, 'r');
  try {
    for (let read = readSync(fd, buffer, 0, buffer.length, null); read > 0; read = readSync(fd, buffer, 0, buffer.length, null)) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
};

/** Inspects a file by its extension; throws AssetError for anything unsupported or broken. */
export const inspectFile = (file: string, tools: MediaTools): Inspection => {
  const extension = path.extname(file).toLowerCase();
  const kind = kindForExtension(extension);
  if (!kind) {
    throw new AssetError(
      'unsupported-format',
      `Unsupported file type "${extension || '(none)'}". Supported: images PNG/JPEG/WebP/SVG, audio MP3/WAV/M4A/AAC/OGG/Opus, video MP4/MOV/WebM, text TXT/MD/SRT/VTT, and JSON.`,
    );
  }
  const size = statSync(file).size;
  if (size === 0) throw new AssetError('corrupt', 'The file is empty.');
  if (size > MAX_BYTES[kind]) throw new AssetError('too-large', `The file is ${(size / 2 ** 20).toFixed(0)} MB; the ${kind} limit is ${(MAX_BYTES[kind] / 2 ** 20).toFixed(0)} MB.`);
  if (kind === 'image') {
    const header = parseImageHeader(extension, readFileSync(file));
    if (header.format === 'svg') return {kind, metadata: header, verified: 'parsed', browserPreview: true, warnings: []};
    const decoded = decodeImage(file, tools, header.alphaChannel);
    const metadata = decoded ? {...header, hasAlpha: decoded.transparentPixels} : header;
    const warnings = decoded ? [] : ['FFmpeg not found: the image header was checked but the pixels were not decoded (transparency is assumed from the alpha channel).'];
    return {kind, metadata, verified: decoded ? 'decoded' : 'header', browserPreview: true, warnings};
  }
  if (kind === 'audio') {
    const {metadata, browserPreview, warnings} = inspectAudio(file, extension, tools);
    return {kind, metadata, verified: 'decoded', browserPreview, warnings};
  }
  if (kind === 'video') {
    const {metadata, browserPreview, warnings} = inspectVideo(file, extension, tools);
    return {kind, metadata, verified: 'decoded', browserPreview, warnings};
  }
  if (kind === 'text') return {kind, metadata: inspectText(extension, readFileSync(file)), verified: 'parsed', browserPreview: true, warnings: []};
  return {kind, metadata: inspectJson(readFileSync(file)).metadata, verified: 'parsed', browserPreview: true, warnings: []};
};

export type ImportOptions = {
  root: string;
  projectId: string;
  file: string;
  role?: string;
  id?: string;
  license?: string;
  notes?: string;
  tools: MediaTools;
  knownProjects: ReadonlySet<string>;
  /** For tests: a fixed clock. */
  now?: () => Date;
};

export type ImportResult = {
  status: 'imported' | 'already-imported' | 'role-updated';
  asset: AssetRecord;
  warnings: string[];
};

export const importAsset = (options: ImportOptions): ImportResult => {
  const {root, projectId, tools, knownProjects} = options;
  checkProjectId(projectId, knownProjects);

  const source = path.resolve(options.file);
  if (!existsSync(source)) throw new AssetError('missing-file', `File not found: ${source}`);
  const stat = lstatSync(source).isSymbolicLink() ? statSync(source) : lstatSync(source);
  if (stat.isDirectory()) throw new AssetError('not-a-file', `${source} is a folder. Import a folder with --dir.`);
  if (!stat.isFile()) throw new AssetError('not-a-file', `${source} is not a regular file.`);
  const realSource = realpathSync(source);
  const mediaRoot = path.resolve(root, 'public', 'user-assets');
  const fromMedia = path.relative(mediaRoot, realSource);
  if (!fromMedia.startsWith('..') && !path.isAbsolute(fromMedia)) {
    throw new AssetError('unsafe-path', 'This file is already inside public/user-assets/. Import the original from its own location instead.');
  }

  if (options.role !== undefined && !isAssetRole(options.role)) {
    throw new AssetError('invalid-role', `Unknown role "${options.role}". Roles: ${Object.keys(ASSET_ROLES).join(', ')}.`);
  }
  if (options.id !== undefined && (!ASSET_ID_PATTERN.test(options.id) || options.id.length > 48)) {
    throw new AssetError('invalid-id', `Asset id "${options.id}" must be lowercase kebab-case starting with a letter (max 48).`);
  }

  const manifest = loadManifest(root, projectId);
  const inspection = inspectFile(realSource, tools);
  const role = (options.role as AssetRole | undefined) ?? inferRole(path.basename(source), inspection.kind);
  const expected = ASSET_ROLES[role];
  if (expected && expected !== inspection.kind) throw new AssetError('invalid-role', `Role "${role}" needs a ${expected} file, but this is ${inspection.kind}.`);
  if (!inspection.browserPreview && role !== 'reference-video') {
    const ext = inspection.kind === 'audio' ? 'wav' : 'mp4';
    throw new AssetError(
      'not-previewable',
      `This ${inspection.kind} uses a codec Chromium cannot play, so it would not preview in Studio or the library. ` +
        `Convert a copy first, e.g. ffmpeg -i "${source}" ${inspection.kind === 'audio' ? '-c:a pcm_s16le' : '-c:v libx264 -pix_fmt yuv420p -c:a aac'} converted.${ext}`,
    );
  }

  const digest = sha256(realSource);
  const existing = manifest.assets.find((asset) => asset.sha256 === digest);
  if (existing) {
    if (options.role && existing.role !== role) {
      const updated = {...existing, role};
      saveManifest(root, {...manifest, assets: manifest.assets.map((asset) => (asset.id === existing.id ? updated : asset))});
      return {status: 'role-updated', asset: updated, warnings: [`Already imported as "${existing.id}"; its role changed from ${existing.role} to ${role}.`]};
    }
    return {status: 'already-imported', asset: existing, warnings: [`Identical content is already imported as "${existing.id}"; nothing was copied.`]};
  }

  const extension = path.extname(source).toLowerCase();
  const taken = new Set(manifest.assets.map((asset) => asset.id));
  const occupied = (id: string) => taken.has(id) || existsSync(publicPath(root, assetFilePath(projectId, inspection.kind, id, extension)));
  let id: string;
  if (options.id) {
    if (occupied(options.id)) throw new AssetError('duplicate-id', `Asset id "${options.id}" is already used in ${projectId}. Choose another --id; existing files are never replaced.`);
    id = options.id;
  } else {
    id = uniqueAssetId(assetIdFromName(path.basename(source, path.extname(source))) ?? role, occupied);
  }

  const relative = assetFilePath(projectId, inspection.kind, id, extension);
  const destination = publicPath(root, relative);
  mkdirSync(path.dirname(destination), {recursive: true});
  copyFileSync(realSource, destination, constants.COPYFILE_EXCL);
  try {
    if (sha256(destination) !== digest) throw new AssetError('corrupt', 'The copy does not match the source; the import was rolled back.');
    const asset: AssetRecord = {
      id,
      kind: inspection.kind,
      role,
      file: relative,
      originalName: path.basename(source),
      sizeBytes: stat.size,
      sha256: digest,
      sourcePath: source,
      importedAt: (options.now?.() ?? new Date()).toISOString(),
      license: options.license?.trim() || DEFAULT_LICENSE,
      verified: inspection.verified,
      browserPreview: inspection.browserPreview,
      metadata: inspection.metadata,
      ...(options.notes ? {notes: options.notes} : {}),
    };
    saveManifest(root, {...manifest, assets: [...manifest.assets, asset]});
    return {status: 'imported', asset, warnings: inspection.warnings};
  } catch (error) {
    rmSync(destination, {force: true});
    throw error;
  }
};

export type DirectoryImport = {imported: ImportResult[]; failed: {file: string; code: string; message: string}[]; skipped: string[]};

/** Imports every supported file in a folder (sorted, optionally recursive). One bad file never stops the rest. */
export const importDirectory = (options: Omit<ImportOptions, 'file' | 'id'> & {dir: string; recursive?: boolean}): DirectoryImport => {
  const dir = path.resolve(options.dir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new AssetError('missing-file', `Folder not found: ${dir}`);
  checkProjectId(options.projectId, options.knownProjects);
  const files: string[] = [];
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (options.recursive) walk(full);
      } else files.push(full);
    }
  };
  walk(dir);
  const result: DirectoryImport = {imported: [], failed: [], skipped: []};
  for (const file of files) {
    if (!kindForExtension(path.extname(file))) {
      result.skipped.push(file);
      continue;
    }
    try {
      result.imported.push(importAsset({...options, file}));
    } catch (error) {
      if (!(error instanceof AssetError)) throw error;
      result.failed.push({file, code: error.code, message: error.message});
    }
  }
  return result;
};

export type AssetCheck = {asset: AssetRecord; present: boolean; intact: boolean | null; timingPresent: boolean | null};

/** Each recorded asset's file presence, content hash, and generated timing, for discovery and validation. */
export const checkAssets = (root: string, manifest: AssetManifest, {hash = false} = {}): AssetCheck[] =>
  manifest.assets.map((asset) => {
    const file = publicPath(root, asset.file);
    const present = existsSync(file);
    return {
      asset,
      present,
      intact: present && hash ? sha256(file) === asset.sha256 : null,
      timingPresent: asset.timing ? existsSync(publicPath(root, asset.timing.file)) : null,
    };
  });

/** Project ids that have a media folder, registered or not. */
export const projectsWithMedia = (root: string) => {
  const dir = path.resolve(root, 'public', 'user-assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, 'assets.json')))
    .map((entry) => entry.name);
};
