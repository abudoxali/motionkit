// Project-scoped voiceover timing. Reads an imported voiceover (never modifies it), detects its
// speech regions with ffmpeg, and — when a transcript exists — aligns the transcript with the local
// MMS forced aligner (align.py). If the aligner cannot run, it falls back to clearly labelled
// estimates; without a transcript it records speech segments only. Output goes to
// public/user-assets/<project>/timing/<voiceover>.json and is linked from the manifest.
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findAsset, timingPath} from '../../src/motion/media/manifest';
import type {AssetManifest, AssetRecord, AudioMetadata} from '../../src/motion/media/manifest';
import {estimateTimings, lowConfidenceWords, speechFromSilences, transcriptLines, validateTiming} from '../../src/motion/media/timing';
import type {TimedLine, VoiceoverTiming} from '../../src/motion/media/timing';
import {AssetError, FFMPEG_SETUP} from './inspect';
import type {MediaTools} from './inspect';
import {publicPath, saveManifest, writeGeneratedFile} from './library';

export const ALIGN_SCRIPT = '.agents/skills/motion-from-reference/scripts/align.py';
/** The pinned, documented optional stack for align.py (CPU). Downloaded once by uv, then cached. */
export const ALIGNER_PACKAGES = ['torch==2.5.1', 'torchaudio==2.5.1', 'uroman', 'numpy'];

/** Speech regions via ffmpeg silencedetect (pauses ≥ minSilence below `noise` dB). */
export const detectSpeech = (ffmpeg: string | null, file: string, duration: number, {noise = -35, minSilence = 0.3} = {}) => {
  if (!ffmpeg) throw new AssetError('missing-dependency', `ffmpeg is required to find pauses in the voiceover. ${FFMPEG_SETUP}`);
  const result = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-map', '0:a:0', '-af', `silencedetect=noise=${noise}dB:d=${minSilence}`, '-f', 'null', '-'], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new AssetError('corrupt', `ffmpeg could not analyse the voiceover: ${(result.stderr ?? result.error?.message ?? '').trim().split(/\r?\n/).slice(-1)[0]}`);
  return speechFromSilences(result.stderr, duration);
};

export type AlignerOutcome =
  | {ok: true; lines: TimedLine[]; source: string}
  | {ok: false; reason: string};

/**
 * Runs align.py through uv with the pinned packages. Offline by default: if the packages or the
 * MMS model are not cached yet the run fails fast with the reason, and nothing is downloaded unless
 * `allowDownload` is set.
 */
export const runForcedAligner = (
  {root, audio, transcriptText, language, allowDownload = false, uv = process.env.ABUD_UV ?? 'uv'}: {root: string; audio: string; transcriptText: string; language: string; allowDownload?: boolean; uv?: string},
): AlignerOutcome => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'abud-align-'));
  try {
    const script = path.join(work, 'script.txt');
    const out = path.join(work, 'words.json');
    writeFileSync(script, transcriptText, 'utf8');
    const args = ['run', '--no-project', ...(allowDownload ? [] : ['--offline']), '--python', '3.12', ...ALIGNER_PACKAGES.flatMap((pkg) => ['--with', pkg]), 'python', path.resolve(root, ALIGN_SCRIPT), '--audio', audio, '--script', script, '--out', out, '--lang', language];
    const env = {...process.env, ...(allowDownload ? {} : {HF_HUB_OFFLINE: '1'}), PYTHONIOENCODING: 'utf-8'};
    const result = spawnSync(uv, args, {cwd: root, encoding: 'utf8', windowsHide: true, env, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000});
    if (result.error) return {ok: false, reason: `could not start uv (${result.error.message}); install uv from https://docs.astral.sh/uv/`};
    if (result.status !== 0) {
      const tail = (result.stderr || result.stdout || '').trim().split(/\r?\n/).slice(-3).join(' | ');
      return {ok: false, reason: `the aligner failed (exit ${result.status}): ${tail}`};
    }
    const data = JSON.parse(readFileSync(out, 'utf8')) as {lines: TimedLine[]; source: string};
    return {ok: true, lines: data.lines, source: data.source};
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
};

export const alignerLanguage = (projectLanguage: string) => (projectLanguage === 'en' ? 'eng' : 'ara');

export type AlignOptions = {
  root: string;
  manifest: AssetManifest;
  voiceoverId?: string;
  /** Transcript asset id; omitted = the project's only transcript; null = time without one. */
  transcriptId?: string | null;
  /** Adopt an imported owner timing JSON instead of aligning. */
  timingId?: string;
  aligner: 'auto' | 'mms' | 'none';
  language: string;
  allowDownload?: boolean;
  tools: MediaTools;
  now?: () => Date;
  /** For tests: replaces the MMS run. */
  forcedAligner?: typeof runForcedAligner;
};

export type AlignResult = {timing: VoiceoverTiming; file: string; notes: string[]};

const pickOne = (manifest: AssetManifest, role: AssetRecord['role'], id: string | undefined, label: string, required: boolean) => {
  if (id) {
    const asset = findAsset(manifest, id);
    if (!asset) throw new AssetError('missing-file', `No asset "${id}" in ${manifest.projectId}. Run npm run asset:list -- --project ${manifest.projectId}.`);
    if (asset.role !== role) throw new AssetError('invalid-role', `"${id}" is a ${asset.role}, not a ${label}.`);
    return asset;
  }
  const candidates = manifest.assets.filter((asset) => asset.role === role);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) throw new AssetError('invalid-role', `${manifest.projectId} has several ${label}s (${candidates.map((asset) => asset.id).join(', ')}); choose one with --${role === 'voiceover' ? 'voiceover' : 'transcript'} <id>.`);
  if (required) throw new AssetError('missing-file', `${manifest.projectId} has no ${label}. Import one with npm run asset:import -- --project ${manifest.projectId} --file <path> --role ${role}.`);
  return null;
};

export const alignVoiceover = (options: AlignOptions): AlignResult => {
  const {root, manifest, tools} = options;
  const voiceover = pickOne(manifest, 'voiceover', options.voiceoverId, 'voiceover', true)!;
  const audioFile = publicPath(root, voiceover.file);
  const duration = (voiceover.metadata as AudioMetadata).durationSeconds;
  const notes: string[] = [];
  const speech = detectSpeech(tools.ffmpeg, audioFile, duration);
  const base = {version: 1 as const, voiceover: voiceover.id, audio: voiceover.file, duration, language: options.language, speech};

  let timing: VoiceoverTiming;
  if (options.timingId) {
    const supplied = pickOne(manifest, 'timing', options.timingId, 'timing file', true)!;
    const value = JSON.parse(readFileSync(publicPath(root, supplied.file), 'utf8')) as Partial<VoiceoverTiming>;
    timing = {...base, method: 'owner-supplied', source: `owner-supplied timing (${supplied.originalName})`, lines: value.lines ?? []};
  } else {
    const transcript = options.transcriptId === null ? null : pickOne(manifest, 'transcript', options.transcriptId, 'transcript', false);
    if (!transcript) {
      timing = {...base, method: 'speech-segments', source: 'ffmpeg silencedetect (no transcript: speech regions only, no words)', lines: []};
      notes.push('No transcript: captions are unavailable and scene timing follows detected speech only. Import the script with --role transcript to enable captions.');
    } else {
      const text = readFileSync(publicPath(root, transcript.file), 'utf8');
      const lines = transcriptLines(text);
      if (lines.length === 0) throw new AssetError('corrupt', `Transcript "${transcript.id}" has no words.`);
      let aligned: AlignerOutcome = {ok: false, reason: 'the aligner was disabled (--aligner none)'};
      if (options.aligner !== 'none') {
        aligned = (options.forcedAligner ?? runForcedAligner)({root, audio: audioFile, transcriptText: lines.map((tokens) => tokens.join(' ')).join('\n'), language: options.language, allowDownload: options.allowDownload});
      }
      if (aligned.ok) {
        timing = {...base, method: 'forced-alignment', source: `${aligned.source} (transcript "${transcript.id}")`, lines: aligned.lines};
      } else if (options.aligner === 'mms') {
        throw new AssetError('missing-dependency', `Forced alignment was requested but ${aligned.reason}. Re-run with --allow-download once to fetch the aligner (≈2 GB), or use --aligner auto for labelled estimates.`);
      } else {
        timing = {...base, method: 'estimated', source: `estimate: transcript "${transcript.id}" spread over detected speech (${aligned.reason})`, lines: estimateTimings(lines, speech, duration)};
        notes.push(`Word timings are ESTIMATES (${aligned.reason}). Captions show whole lines only; word highlighting needs forced alignment.`);
      }
    }
  }

  const errors = validateTiming(timing, duration).filter((issue) => issue.severity === 'error');
  if (errors.length > 0) throw new AssetError('invalid-timing', `The timing is inconsistent with the audio and was not saved:\n  ${errors.map((issue) => issue.message).join('\n  ')}`);
  for (const warning of validateTiming(timing, duration).filter((issue) => issue.severity === 'warning')) notes.push(warning.message);
  const low = lowConfidenceWords(timing);
  if (low.length > 0) {
    timing.lowConfidence = low;
    notes.push(`${low.length} low-confidence word(s) to check by ear: ${low.slice(0, 12).join(' ')}${low.length > 12 ? ' …' : ''}`);
  }

  const relative = timingPath(manifest.projectId, voiceover.id);
  const file = publicPath(root, relative);
  // Timing is generated data: it is replaced on every run.
  writeGeneratedFile(file, `${JSON.stringify(timing, null, 1)}\n`);
  const updated: AssetRecord = {
    ...voiceover,
    timing: {file: relative, method: timing.method, generatedAt: (options.now?.() ?? new Date()).toISOString(), lowConfidenceWords: low.length},
  };
  saveManifest(root, {...manifest, assets: manifest.assets.map((asset) => (asset.id === voiceover.id ? updated : asset))});
  return {timing, file: relative, notes};
};
