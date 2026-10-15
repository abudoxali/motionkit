// Inspects one supplied file: format, integrity, and metadata. Images are parsed from their headers
// (no dependency) and, when FFmpeg is installed, fully decoded; audio and video need ffprobe and
// ffmpeg, and without them the import stops with setup instructions instead of guessing.
import {spawnSync} from 'node:child_process';
import type {
  AssetKind,
  AssetMetadata,
  AudioMetadata,
  DataMetadata,
  ImageMetadata,
  TextMetadata,
  VideoMetadata,
} from '../../src/motion/media/manifest';
import {validateTiming} from '../../src/motion/media/timing';
import {dominantDirection} from '../../src/motion/typography/script';

export class AssetError extends Error {
  constructor(
    readonly code:
      | 'missing-file'
      | 'not-a-file'
      | 'unsupported-format'
      | 'corrupt'
      | 'unsafe-path'
      | 'unsafe-svg'
      | 'unknown-project'
      | 'missing-dependency'
      | 'invalid-role'
      | 'invalid-id'
      | 'duplicate-id'
      | 'too-large'
      | 'invalid-timing'
      | 'not-previewable'
      | 'invalid-manifest',
    message: string,
  ) {
    super(message);
  }
}

// Tools ------------------------------------------------------------------------------------------

export type MediaTools = {ffprobe: string | null; ffmpeg: string | null};

const toolWorks = (command: string) => {
  const result = spawnSync(command, ['-version'], {encoding: 'utf8', windowsHide: true});
  return !result.error && result.status === 0;
};

/** ffprobe/ffmpeg from PATH, or from ABUD_FFPROBE / ABUD_FFMPEG. Null when not runnable. */
export const detectMediaTools = (env: NodeJS.ProcessEnv = process.env): MediaTools => {
  const ffprobe = env.ABUD_FFPROBE ?? 'ffprobe';
  const ffmpeg = env.ABUD_FFMPEG ?? 'ffmpeg';
  return {ffprobe: toolWorks(ffprobe) ? ffprobe : null, ffmpeg: toolWorks(ffmpeg) ? ffmpeg : null};
};

export const FFMPEG_SETUP =
  'Install FFmpeg (it includes ffprobe) and make it available on PATH — on Windows: `winget install Gyan.FFmpeg`, ' +
  'then open a new terminal. A custom location can be set with ABUD_FFPROBE and ABUD_FFMPEG.';

const requireTool = (tool: string | null, name: 'ffprobe' | 'ffmpeg', what: string): string => {
  if (!tool) throw new AssetError('missing-dependency', `${name} is required to ${what} but was not found. ${FFMPEG_SETUP}`);
  return tool;
};

// Images -----------------------------------------------------------------------------------------

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) + b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);

const imageMeta = (format: ImageMetadata['format'], width: number, height: number, hasAlpha: boolean): ImageMetadata => {
  if (!(width > 0 && height > 0)) throw new AssetError('corrupt', `The ${format.toUpperCase()} header reports an empty image (${width}×${height}).`);
  const aspectRatio = Math.round((width / height) * 10000) / 10000;
  return {format, width, height, aspectRatio, orientation: Math.abs(width - height) <= 1 ? 'square' : width > height ? 'landscape' : 'portrait', alphaChannel: hasAlpha, hasAlpha};
};

const parsePng = (b: Uint8Array): ImageMetadata => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || signature.some((value, index) => b[index] !== value)) throw new AssetError('corrupt', 'Not a PNG file (bad signature).');
  if (ascii(b, 12, 4) !== 'IHDR') throw new AssetError('corrupt', 'PNG is missing its IHDR header.');
  const colorType = b[25];
  let alpha = colorType === 4 || colorType === 6;
  let offset = 8;
  let ended = false;
  while (offset + 8 <= b.length) {
    const length = u32be(b, offset);
    const type = ascii(b, offset + 4, 4);
    if (type === 'tRNS') alpha = true;
    if (type === 'IEND') {
      ended = true;
      break;
    }
    offset += 12 + length;
  }
  if (!ended) throw new AssetError('corrupt', 'PNG is truncated (no IEND chunk).');
  return imageMeta('png', u32be(b, 16), u32be(b, 20), alpha);
};

const parseJpeg = (b: Uint8Array): ImageMetadata => {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new AssetError('corrupt', 'Not a JPEG file (bad signature).');
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      const tail = b.subarray(Math.max(0, b.length - 65536));
      let hasEnd = false;
      for (let index = tail.length - 2; index >= 0; index -= 1) {
        if (tail[index] === 0xff && tail[index + 1] === 0xd9) {
          hasEnd = true;
          break;
        }
      }
      if (!hasEnd) throw new AssetError('corrupt', 'JPEG is truncated (no end-of-image marker).');
      return imageMeta('jpeg', u16be(b, offset + 7), u16be(b, offset + 5), false);
    }
    offset += 2 + u16be(b, offset + 2);
  }
  throw new AssetError('corrupt', 'JPEG has no frame header.');
};

const parseWebp = (b: Uint8Array): ImageMetadata => {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') throw new AssetError('corrupt', 'Not a WebP file (bad signature).');
  if (u32le(b, 4) + 8 > b.length) throw new AssetError('corrupt', 'WebP is truncated (RIFF size exceeds the file).');
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return imageMeta('webp', 1 + u24le(b, 24), 1 + u24le(b, 27), (b[20] & 0x10) !== 0);
  if (chunk === 'VP8L') {
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
    return imageMeta('webp', 1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), ((b3 >> 4) & 1) === 1);
  }
  if (chunk === 'VP8 ') return imageMeta('webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff, false);
  throw new AssetError('corrupt', `Unknown WebP chunk "${chunk}".`);
};

/**
 * SVG is accepted only as passive vector art: scripts, event handlers, external references,
 * foreignObject, and DTDs/entities are refused, since the file is served to the browser as-is.
 */
export const parseSvg = (text: string): ImageMetadata => {
  const lower = text.toLowerCase();
  const unsafe: [RegExp, string][] = [
    [/<script[\s>]/, 'a <script> element'],
    [/\son[a-z]+\s*=/, 'an event handler attribute'],
    [/javascript:/, 'a javascript: URL'],
    [/<foreignobject[\s>]/, 'a <foreignObject> element'],
    [/<!doctype|<!entity/, 'a DTD or entity declaration'],
    [/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/)[^"']+["']/, 'an external reference (href)'],
    [/url\(\s*["']?\s*(?!#)(?:https?:|\/\/|file:)/, 'an external url()'],
    [/@import/, 'a CSS @import'],
  ];
  for (const [pattern, label] of unsafe) {
    if (pattern.test(lower)) throw new AssetError('unsafe-svg', `SVG refused: it contains ${label}. Export it again as plain vector art or as a PNG.`);
  }
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) throw new AssetError('corrupt', 'Not an SVG file (no <svg> element).');
  const attribute = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(root)?.[1];
  const length = (value?: string) => (value && /^\s*[\d.]+\s*(px)?\s*$/.test(value) ? Number.parseFloat(value) : NaN);
  const viewBox = attribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  let width = length(attribute('width'));
  let height = length(attribute('height'));
  if (!(width > 0 && height > 0) && viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    width = viewBox[2];
    height = viewBox[3];
  }
  if (!(width > 0 && height > 0)) throw new AssetError('corrupt', 'SVG has no usable size: give the root <svg> a viewBox or pixel width and height.');
  return imageMeta('svg', Math.round(width), Math.round(height), true);
};

export const parseImageHeader = (extension: string, bytes: Uint8Array): ImageMetadata => {
  switch (extension) {
    case '.png':
      return parsePng(bytes);
    case '.jpg':
    case '.jpeg':
      return parseJpeg(bytes);
    case '.webp':
      return parseWebp(bytes);
    case '.svg':
      return parseSvg(decodeUtf8(bytes, 'SVG'));
    default:
      throw new AssetError('unsupported-format', `Unsupported image extension ${extension}.`);
  }
};

// Text -------------------------------------------------------------------------------------------

const decodeUtf8 = (bytes: Uint8Array, label: string) => {
  try {
    const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^﻿/, '');
    if (text.includes('\u0000')) throw new Error('binary');
    return text;
  } catch {
    throw new AssetError('corrupt', `${label} is not valid UTF-8 text. Save it as UTF-8 and import again.`);
  }
};

export const inspectText = (extension: string, bytes: Uint8Array): TextMetadata => {
  const text = decodeUtf8(bytes, 'The file');
  const format: TextMetadata['format'] = extension === '.md' ? 'markdown' : extension === '.srt' ? 'srt' : extension === '.vtt' ? 'vtt' : 'plain';
  if (format === 'vtt' && !/^WEBVTT/.test(text.trimStart())) throw new AssetError('corrupt', 'WebVTT captions must start with "WEBVTT".');
  if (format === 'srt' && !/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) throw new AssetError('corrupt', 'SRT captions have no "00:00:00,000 -->" cue timings.');
  if (!text.trim()) throw new AssetError('corrupt', 'The text file is empty.');
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  return {format, characters: [...text].length, lines, words: text.split(/\s+/).filter(Boolean).length, direction: dominantDirection(text, 'ltr')};
};

export const inspectJson = (bytes: Uint8Array): {metadata: DataMetadata; value: unknown} => {
  const text = decodeUtf8(bytes, 'JSON');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new AssetError('corrupt', `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const looksLikeTiming = Boolean(value && typeof value === 'object' && 'lines' in value && 'duration' in value);
  if (looksLikeTiming) {
    const errors = validateTiming(value).filter((issue) => issue.severity === 'error');
    if (errors.length > 0) throw new AssetError('invalid-timing', `Timing JSON rejected:\n  ${errors.map((issue) => issue.message).join('\n  ')}`);
  }
  return {metadata: {format: 'json', schema: looksLikeTiming ? 'timing' : 'unknown'}, value};
};

// Audio and video --------------------------------------------------------------------------------

type ProbeStream = {codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; disposition?: {attached_pic?: number}};
type Probe = {streams?: ProbeStream[]; format?: {format_name?: string; duration?: string; bit_rate?: string}};

const BROWSER_AUDIO = new Set(['mp3', 'aac', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_u8']);
const BROWSER_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);

/** Container families ffprobe must report for each extension, so a renamed file is caught. */
const CONTAINERS: Record<string, RegExp> = {
  '.mp3': /\bmp3\b/,
  '.wav': /\bwav\b/,
  '.m4a': /\b(mov|mp4|m4a)\b/,
  '.aac': /\baac\b/,
  '.ogg': /\bogg\b/,
  '.opus': /\bogg\b/,
  '.mp4': /\b(mov|mp4)\b/,
  '.mov': /\b(mov|mp4)\b/,
  '.webm': /\bwebm\b|\bmatroska\b/,
};

const runProbe = (ffprobe: string, file: string): Probe => {
  const result = spawnSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  if (result.error) throw new AssetError('missing-dependency', `Could not run ffprobe: ${result.error.message}. ${FFMPEG_SETUP}`);
  if (result.status !== 0) throw new AssetError('corrupt', `ffprobe could not read the file: ${(result.stderr || 'unknown error').trim().split(/\r?\n/).slice(-2).join(' ')}`);
  try {
    return JSON.parse(result.stdout) as Probe;
  } catch {
    throw new AssetError('corrupt', 'ffprobe returned unreadable output for this file.');
  }
};

/** Decodes (part of) the file with ffmpeg; corrupt data fails here even when the header parses. */
const decodeCheck = (ffmpeg: string, file: string, limit: string[]) => {
  const result = spawnSync(ffmpeg, ['-v', 'error', '-nostdin', '-i', file, ...limit, '-f', 'null', '-'], {encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  if (result.error) throw new AssetError('missing-dependency', `Could not run ffmpeg: ${result.error.message}. ${FFMPEG_SETUP}`);
  const errors = (result.stderr ?? '').split(/\r?\n/).filter((line) => line.trim());
  if (result.status !== 0) throw new AssetError('corrupt', `The file could not be decoded: ${errors.slice(-2).join(' ') || `ffmpeg exited with ${result.status}`}`);
  return errors;
};

const rate = (value?: string) => {
  if (!value) return 0;
  const [numerator, denominator] = value.split('/').map(Number);
  return denominator ? numerator / denominator : numerator || 0;
};

const container = (probe: Probe) => probe.format?.format_name ?? 'unknown';

export const inspectAudio = (file: string, extension: string, tools: MediaTools) => {
  const probe = runProbe(requireTool(tools.ffprobe, 'ffprobe', 'read audio metadata'), file);
  if (!CONTAINERS[extension]?.test(container(probe))) {
    throw new AssetError('corrupt', `The file is named ${extension} but contains "${container(probe)}" data.`);
  }
  const stream = probe.streams?.find((item) => item.codec_type === 'audio');
  if (!stream?.codec_name) throw new AssetError('corrupt', 'The file has no audio stream.');
  const durationSeconds = Number(probe.format?.duration);
  if (!(durationSeconds > 0)) throw new AssetError('corrupt', 'The audio has no measurable duration.');
  const warnings = decodeCheck(requireTool(tools.ffmpeg, 'ffmpeg', 'verify audio'), file, ['-map', '0:a:0']);
  const metadata: AudioMetadata = {
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    channels: stream.channels ?? 0,
    sampleRate: Number(stream.sample_rate) || 0,
    codec: stream.codec_name,
    container: container(probe),
    ...(probe.format?.bit_rate ? {bitRate: Number(probe.format.bit_rate)} : {}),
  };
  return {metadata, browserPreview: BROWSER_AUDIO.has(stream.codec_name), warnings};
};

export const inspectVideo = (file: string, extension: string, tools: MediaTools) => {
  const probe = runProbe(requireTool(tools.ffprobe, 'ffprobe', 'read video metadata'), file);
  if (!CONTAINERS[extension]?.test(container(probe))) {
    throw new AssetError('corrupt', `The file is named ${extension} but contains "${container(probe)}" data.`);
  }
  const video = probe.streams?.find((item) => item.codec_type === 'video' && !item.disposition?.attached_pic);
  if (!video?.codec_name || !video.width || !video.height) throw new AssetError('corrupt', 'The file has no video stream.');
  const audio = probe.streams?.find((item) => item.codec_type === 'audio');
  const durationSeconds = Number(probe.format?.duration);
  if (!(durationSeconds > 0)) throw new AssetError('corrupt', 'The video has no measurable duration.');
  const warnings = decodeCheck(requireTool(tools.ffmpeg, 'ffmpeg', 'verify video'), file, ['-t', '3', '-map', '0:v:0']);
  const metadata: VideoMetadata = {
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    width: video.width,
    height: video.height,
    fps: Math.round(rate(video.avg_frame_rate) * 1000) / 1000 || Math.round(rate(video.r_frame_rate) * 1000) / 1000,
    codec: video.codec_name,
    container: container(probe),
    hasAudio: Boolean(audio),
    ...(audio?.codec_name ? {audioCodec: audio.codec_name} : {}),
  };
  const browserPreview = BROWSER_VIDEO.has(video.codec_name) && (!audio?.codec_name || BROWSER_AUDIO.has(audio.codec_name));
  return {metadata, browserPreview, warnings};
};

/** Full pixel decode of a raster image when ffmpeg is available. */
/**
 * Full pixel decode of a raster image when ffmpeg is available. For images with an alpha channel
 * the decoded pixels are scanned, so an opaque RGBA screenshot is not reported as transparent.
 * Returns null without ffmpeg (header check only).
 */
export const decodeImage = (file: string, tools: MediaTools, alphaChannel: boolean): {transparentPixels: boolean} | null => {
  if (!tools.ffmpeg) return null;
  const decodeFailed = (errors: string[]) => errors.some((line) => /error|invalid|corrupt|truncat/i.test(line));
  if (!alphaChannel) {
    const errors = decodeCheck(tools.ffmpeg, file, ['-frames:v', '1']);
    if (decodeFailed(errors)) throw new AssetError('corrupt', `The image could not be decoded cleanly: ${errors.slice(-2).join(' ')}`);
    return {transparentPixels: false};
  }
  // One decode to raw RGBA both verifies the pixels and measures transparency.
  const raw = spawnSync(tools.ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {windowsHide: true, maxBuffer: 1024 * 2 ** 20});
  if (raw.error) throw new AssetError('missing-dependency', `Could not run ffmpeg: ${raw.error.message}. ${FFMPEG_SETUP}`);
  const errors = String(raw.stderr ?? '').split(/\r?\n/).filter((line) => line.trim());
  if (raw.status !== 0 || !raw.stdout?.length || decodeFailed(errors)) {
    throw new AssetError('corrupt', `The image could not be decoded cleanly: ${errors.slice(-2).join(' ') || 'no pixels'}`);
  }
  const pixels = raw.stdout as Buffer;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) return {transparentPixels: true};
  return {transparentPixels: false};
};

export type Inspection = {
  kind: AssetKind;
  metadata: AssetMetadata;
  verified: 'decoded' | 'header' | 'parsed';
  browserPreview: boolean;
  warnings: string[];
};
