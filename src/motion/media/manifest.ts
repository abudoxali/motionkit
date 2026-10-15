// Project media manifest: the one place an agent or a component learns which owner-supplied files a
// project has, what they are, and where they live. Files and manifest sit in the git-ignored
// public/user-assets/<project>/ folder, so they are served by Studio and the library but never
// committed. Written only by scripts/asset.ts (npm run asset:import); read everywhere else.
// Pure and serialisable: no Node or React imports.

export const MEDIA_ROOT = 'user-assets';
export const MANIFEST_FILE = 'assets.json';
export const MANIFEST_VERSION = 1;

export const ASSET_KINDS = ['image', 'audio', 'video', 'text', 'data'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** What an asset is for. The role decides which components and workflows may use it. */
export const ASSET_ROLES = {
  voiceover: 'audio',
  music: 'audio',
  sfx: 'audio',
  screenshot: 'image',
  character: 'image',
  'character-pose': 'image',
  'character-layer': 'image',
  logo: 'image',
  product: 'image',
  background: 'image',
  illustration: 'image',
  'reference-video': 'video',
  footage: 'video',
  transcript: 'text',
  captions: 'text',
  timing: 'data',
  data: 'data',
  other: null,
} as const satisfies Record<string, AssetKind | null>;
export type AssetRole = keyof typeof ASSET_ROLES;
export const isAssetRole = (value: string): value is AssetRole => Object.hasOwn(ASSET_ROLES, value);

/** Supported extensions per kind. Only formats that are verified on import and play in Chromium. */
export const EXTENSIONS: Record<string, AssetKind> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.ogg': 'audio',
  '.opus': 'audio',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.txt': 'text',
  '.md': 'text',
  '.srt': 'text',
  '.vtt': 'text',
  '.json': 'data',
};

export const kindForExtension = (extension: string): AssetKind | null => EXTENSIONS[extension.toLowerCase()] ?? null;

export type ImageMetadata = {
  format: 'png' | 'jpeg' | 'webp' | 'svg';
  width: number;
  height: number;
  aspectRatio: number;
  orientation: 'landscape' | 'portrait' | 'square';
  /** The file carries an alpha channel (or PNG tRNS); many opaque screenshots do too. */
  alphaChannel: boolean;
  /**
   * Some pixels are actually transparent. Measured by a pixel scan when FFmpeg decoded the image;
   * otherwise it repeats alphaChannel (see AssetRecord.verified).
   */
  hasAlpha: boolean;
};

export type AudioMetadata = {
  durationSeconds: number;
  channels: number;
  sampleRate: number;
  codec: string;
  container: string;
  bitRate?: number;
};

export type VideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  container: string;
  hasAudio: boolean;
  audioCodec?: string;
};

export type TextMetadata = {
  format: 'plain' | 'markdown' | 'srt' | 'vtt';
  characters: number;
  lines: number;
  words: number;
  direction: 'rtl' | 'ltr';
};

export type DataMetadata = {format: 'json'; schema: 'timing' | 'unknown'};

export type AssetMetadata = ImageMetadata | AudioMetadata | VideoMetadata | TextMetadata | DataMetadata;

/** Project-scoped timing generated for a voiceover (npm run voiceover:align). */
export type VoiceoverTimingRef = {
  /** Path relative to public/. */
  file: string;
  method: TimingMethod;
  generatedAt: string;
  lowConfidenceWords: number;
};

export type AssetRecord = {
  id: string;
  kind: AssetKind;
  role: AssetRole;
  /** Path relative to public/, for staticFile(). */
  file: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
  /** Absolute path the owner imported from; kept for traceability (the manifest is git-ignored). */
  sourcePath: string;
  importedAt: string;
  license: string;
  /** How the integrity check ran: a full decode, a header parse only, or a text/JSON parse. */
  verified: 'decoded' | 'header' | 'parsed';
  /** Chromium (Studio and library preview) can display or play this file. */
  browserPreview: boolean;
  metadata: AssetMetadata;
  timing?: VoiceoverTimingRef;
  notes?: string;
};

export type AssetManifest = {
  version: typeof MANIFEST_VERSION;
  projectId: string;
  assets: AssetRecord[];
};

export const ASSET_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MAX_ASSET_ID_LENGTH = 48;

export const projectMediaDir = (projectId: string) => `${MEDIA_ROOT}/${projectId}`;
export const manifestPath = (projectId: string) => `${projectMediaDir(projectId)}/${MANIFEST_FILE}`;
export const timingPath = (projectId: string, voiceoverId: string) => `${projectMediaDir(projectId)}/timing/${voiceoverId}.json`;

const KIND_DIRS: Record<AssetKind, string> = {image: 'images', audio: 'audio', video: 'video', text: 'text', data: 'data'};
export const assetFilePath = (projectId: string, kind: AssetKind, id: string, extension: string) =>
  `${projectMediaDir(projectId)}/${KIND_DIRS[kind]}/${id}${extension.toLowerCase()}`;

/** A portable ASCII asset id from a file name, or null if nothing portable is left. */
export const assetIdFromName = (name: string): string | null => {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/g, '')
    .slice(0, MAX_ASSET_ID_LENGTH)
    .replace(/-+$/g, '');
  return slug && ASSET_ID_PATTERN.test(slug) ? slug : null;
};

/** First free id: base, base-2, base-3, … */
export const uniqueAssetId = (base: string, isTaken: (id: string) => boolean) => {
  if (!isTaken(base)) return base;
  for (let index = 2; ; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, MAX_ASSET_ID_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
};

/** Role guessed from a file name and kind; the owner's --role always wins. */
export const inferRole = (name: string, kind: AssetKind): AssetRole => {
  // Whole name tokens ("home-screen_2.png" → home, screen, 2, png), so "chart" is not a
  // character and "happy" is not an app screenshot. A trailing plural "s" is ignored.
  const tokens = new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+|(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/)
      .filter(Boolean)
      .map((token) => (token.length > 3 ? token.replace(/s$/, '') : token)),
  );
  const has = (...words: string[]) => words.some((word) => tokens.has(word));
  if (kind === 'audio') {
    if (has('voice', 'voiceover', 'narration', 'narrator', 'vo', 'elevenlabs', 'speech', 'tts')) return 'voiceover';
    if (has('music', 'bgm', 'track', 'song', 'soundtrack')) return 'music';
    if (has('sfx', 'whoosh', 'click', 'pop', 'hit', 'swish', 'riser', 'effect')) return 'sfx';
    return 'other';
  }
  if (kind === 'image') {
    if (has('screen', 'screenshot', 'capture', 'ui', 'app', 'shot', 'mockup')) return 'screenshot';
    if (has('logo', 'brand', 'logomark', 'wordmark')) return 'logo';
    if (has('pose')) return 'character-pose';
    if (has('character', 'char', 'person', 'hero', 'mascot', 'avatar')) return 'character';
    if (has('bg', 'background', 'backdrop')) return 'background';
    if (has('product', 'photo', 'packshot')) return 'product';
    return 'illustration';
  }
  if (kind === 'video') return has('ref', 'reference', 'style', 'inspo', 'inspiration') ? 'reference-video' : 'footage';
  if (kind === 'text') return has('srt', 'vtt', 'caption', 'subtitle') ? 'captions' : 'transcript';
  return has('timing', 'word', 'align', 'alignment') ? 'timing' : 'data';
};

export type ManifestIssue = {severity: 'error' | 'warning'; path: string; message: string};

const isRelativePublicPath = (value: string) =>
  typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).includes('..');

/** Structural validation of a parsed manifest (from disk or fetched by a component). */
export const validateManifest = (value: unknown, projectId?: string): ManifestIssue[] => {
  const issues: ManifestIssue[] = [];
  const error = (path: string, message: string) => issues.push({severity: 'error', path, message});
  if (!value || typeof value !== 'object') return [{severity: 'error', path: '', message: 'manifest is not an object'}];
  const manifest = value as Partial<AssetManifest>;
  if (manifest.version !== MANIFEST_VERSION) error('version', `expected ${MANIFEST_VERSION}`);
  if (typeof manifest.projectId !== 'string') error('projectId', 'is required');
  else if (projectId && manifest.projectId !== projectId) error('projectId', `belongs to "${manifest.projectId}", not "${projectId}"`);
  if (!Array.isArray(manifest.assets)) {
    error('assets', 'must be an array');
    return issues;
  }
  const ids = new Set<string>();
  manifest.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (!asset || typeof asset !== 'object') return error(path, 'is not an object');
    if (typeof asset.id !== 'string' || !ASSET_ID_PATTERN.test(asset.id)) error(`${path}.id`, 'invalid asset id');
    else if (ids.has(asset.id)) error(`${path}.id`, `duplicate asset id "${asset.id}"`);
    ids.add(asset.id);
    if (!ASSET_KINDS.includes(asset.kind)) error(`${path}.kind`, `unknown kind "${String(asset.kind)}"`);
    if (typeof asset.role !== 'string' || !isAssetRole(asset.role)) error(`${path}.role`, `unknown role "${String(asset.role)}"`);
    else {
      const expected = ASSET_ROLES[asset.role];
      if (expected && expected !== asset.kind) error(`${path}.role`, `role "${asset.role}" needs a ${expected} file, not ${asset.kind}`);
    }
    if (!isRelativePublicPath(asset.file)) error(`${path}.file`, 'must be relative to public/ without ".."');
    else if (manifest.projectId && !asset.file.startsWith(`${projectMediaDir(manifest.projectId)}/`)) {
      error(`${path}.file`, `must live under public/${projectMediaDir(manifest.projectId)}/`);
    }
    if (asset.timing && !isRelativePublicPath(asset.timing.file)) error(`${path}.timing.file`, 'must be relative to public/');
    const meta = (asset.metadata ?? {}) as Record<string, unknown>;
    const positive = (key: string) => typeof meta[key] === 'number' && Number.isFinite(meta[key]) && (meta[key] as number) > 0;
    const needs: Partial<Record<AssetKind, string[]>> = {image: ['width', 'height'], audio: ['durationSeconds'], video: ['width', 'height', 'durationSeconds']};
    for (const key of needs[asset.kind] ?? []) if (!positive(key)) error(`${path}.metadata.${key}`, 'must be a positive number');
    if (typeof asset.license !== 'string' || !asset.license.trim()) error(`${path}.license`, 'record the license or ownership');
  });
  return issues;
};

export const findAsset = (manifest: AssetManifest, id: string) => manifest.assets.find((asset) => asset.id === id) ?? null;

export const describeAsset = (asset: AssetRecord): string => {
  switch (asset.kind) {
    case 'image': {
      const meta = asset.metadata as ImageMetadata;
      return `${meta.width}×${meta.height} ${meta.format}${meta.hasAlpha ? ' · transparent' : ''}`;
    }
    case 'audio': {
      const meta = asset.metadata as AudioMetadata;
      return `${meta.durationSeconds.toFixed(2)}s · ${meta.codec} · ${meta.channels}ch · ${meta.sampleRate} Hz`;
    }
    case 'video': {
      const meta = asset.metadata as VideoMetadata;
      return `${meta.durationSeconds.toFixed(2)}s · ${meta.width}×${meta.height} @ ${Math.round(meta.fps * 100) / 100} fps · ${meta.codec}${meta.hasAudio ? ' + audio' : ''}`;
    }
    case 'text': {
      const meta = asset.metadata as TextMetadata;
      return `${meta.words} words · ${meta.lines} lines · ${meta.direction.toUpperCase()}`;
    }
    default:
      return (asset.metadata as DataMetadata).schema === 'timing' ? 'JSON timing' : 'JSON';
  }
};

// Timing ---------------------------------------------------------------------------------------

/**
 * How timings were obtained. Only "forced-alignment" (and owner-supplied word timings) are word
 * accurate; "estimated" spreads the transcript over detected speech; "speech-segments" has no
 * words at all.
 */
export type TimingMethod = 'forced-alignment' | 'owner-supplied' | 'estimated' | 'speech-segments';
export const WORD_ACCURATE_METHODS: readonly TimingMethod[] = ['forced-alignment', 'owner-supplied'];
