import type {TimingMethod} from './manifest';
import {WORD_ACCURATE_METHODS} from './manifest';

// Voiceover timing: the shape align.py writes, extended with how it was obtained, plus the pure
// helpers that turn it into captions, scene boundaries, and music ducking. Times are seconds in the
// original (unmodified) voiceover; frames are derived at the composition's fps.

export type TimedWordSeconds = {w: string; start: number; end: number; conf?: number};
export type TimedLine = {text: string; start: number; end: number; words: TimedWordSeconds[]};
export type SpeechSegment = {start: number; end: number};

export type VoiceoverTiming = {
  version: 1;
  method: TimingMethod;
  /** Human-readable origin, e.g. "align.py: MMS_FA forced alignment". */
  source: string;
  /** Asset id of the voiceover in the project manifest. */
  voiceover: string;
  /** Path of the audio the timings refer to, relative to public/. */
  audio: string;
  /** Real duration of that audio in seconds. */
  duration: number;
  language?: string;
  /** Speech regions detected in the audio (ffmpeg silencedetect), when available. */
  speech?: SpeechSegment[];
  /** Empty when no transcript was supplied ("speech-segments"). */
  lines: TimedLine[];
  /** Words whose alignment score is below the threshold, for owner review. */
  lowConfidence?: string[];
};

export const LOW_CONFIDENCE = 0.2;
/** Tolerance for timings slightly past the decoded duration (MP3 padding). */
const END_TOLERANCE = 0.25;

export const isWordAccurate = (timing: Pick<VoiceoverTiming, 'method'>) => WORD_ACCURATE_METHODS.includes(timing.method);

export type TimingIssue = {severity: 'error' | 'warning'; message: string};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Rejects timings that are malformed, unordered, or outside the audio. */
export const validateTiming = (value: unknown, audioDuration?: number): TimingIssue[] => {
  const issues: TimingIssue[] = [];
  const error = (message: string) => issues.push({severity: 'error', message});
  const warn = (message: string) => issues.push({severity: 'warning', message});
  if (!value || typeof value !== 'object') return [{severity: 'error', message: 'timing is not an object'}];
  const timing = value as Partial<VoiceoverTiming>;
  if (!finite(timing.duration) || timing.duration <= 0) error('duration must be a positive number of seconds');
  if (!Array.isArray(timing.lines)) {
    error('lines must be an array');
    return issues;
  }
  const limit = (finite(audioDuration) ? audioDuration : finite(timing.duration) ? timing.duration : Infinity) + END_TOLERANCE;
  if (finite(audioDuration) && finite(timing.duration) && Math.abs(audioDuration - timing.duration) > END_TOLERANCE) {
    error(`timing duration ${timing.duration.toFixed(2)}s does not match the audio (${audioDuration.toFixed(2)}s)`);
  }
  let previousEnd = -Infinity;
  timing.lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
    if (!line || typeof line.text !== 'string' || !line.text.trim()) return error(`${at}: text is required`);
    if (!finite(line.start) || !finite(line.end) || line.start < 0 || line.end < line.start) return error(`${at}: invalid start/end`);
    if (line.end > limit) error(`${at}: ends at ${line.end.toFixed(2)}s, after the audio`);
    if (line.start < previousEnd - 0.05) error(`${at}: starts before the previous line ends`);
    previousEnd = line.end;
    if (!Array.isArray(line.words) || line.words.length === 0) return error(`${at}: words are required`);
    let wordEnd = -Infinity;
    line.words.forEach((word, wordIndex) => {
      const wat = `${at} word ${wordIndex + 1}`;
      if (!word || typeof word.w !== 'string' || !word.w) return error(`${wat}: text is required`);
      if (!finite(word.start) || !finite(word.end) || word.end < word.start) return error(`${wat}: invalid start/end`);
      if (word.start < wordEnd - 0.05) error(`${wat}: out of order`);
      if (word.start < line.start - 0.05 || word.end > line.end + 0.05) error(`${wat}: outside its line`);
      wordEnd = word.end;
    });
    // Crowding: many words squeezed into almost no time is the classic failed-alignment shape.
    const span = line.end - line.start;
    if (line.words.length >= 3 && span / line.words.length < 0.06) warn(`${at}: ${line.words.length} words in ${span.toFixed(2)}s — alignment looks collapsed`);
  });
  return issues;
};

export const lowConfidenceWords = (timing: VoiceoverTiming, threshold = LOW_CONFIDENCE) =>
  timing.lines.flatMap((line) => line.words.filter((word) => finite(word.conf) && word.conf < threshold).map((word) => word.w));

// Transcript -------------------------------------------------------------------------------------

const EDGE = /^[«»“”"'.,،؛;؟?:!…()[\]{}\-–—]+|[«»“”"'.,،؛;؟?:!…()[\]{}\-–—]+$/g;

/**
 * Transcript lines as align.py reads them: one on-screen line per non-empty line, ElevenLabs
 * [tags] removed, "..." dropped, tokens that are only punctuation skipped.
 */
export const transcriptLines = (text: string): string[][] =>
  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((raw) => raw.replace(/\[[^\]]*\]/g, ' ').replace(/\.\.\./g, ' ').replace(/…/g, '… ').trim())
    .map((line) => line.split(/\s+/).filter((token) => token.replace(EDGE, '').length > 0))
    .filter((tokens) => tokens.length > 0);

/**
 * Estimated timings when no aligner is available: the transcript is spread over the detected
 * speech in proportion to each word's length, skipping the pauses. Every time is an estimate and
 * the result is labelled "estimated"; word highlighting is never driven by it.
 */
export const estimateTimings = (lines: readonly (readonly string[])[], speech: readonly SpeechSegment[], duration: number): TimedLine[] => {
  const regions = speech.length > 0 ? speech : [{start: 0, end: duration}];
  const total = regions.reduce((sum, region) => sum + (region.end - region.start), 0);
  const weights = lines.map((tokens) => tokens.map((token) => Math.max(1, token.replace(EDGE, '').length) + 1));
  const weightSum = weights.flat().reduce((sum, value) => sum + value, 0);
  if (weightSum === 0 || total <= 0) return [];
  // Speech-time offset → region index and absolute time inside it.
  const at = (offset: number) => {
    let remaining = offset;
    for (let index = 0; index < regions.length; index += 1) {
      const length = regions[index].end - regions[index].start;
      if (remaining <= length + 1e-9) return {region: index, time: regions[index].start + Math.min(remaining, length)};
      remaining -= length;
    }
    return {region: regions.length - 1, time: regions[regions.length - 1].end};
  };
  let cursor = 0;
  // Floor, not round, so a word never ends past the speech region it was placed in.
  const floor = (value: number) => Math.floor(value * 1000) / 1000;
  const ceil = (value: number) => Math.ceil(value * 1000) / 1000;
  return lines.map((tokens, lineIndex) => {
    const words = tokens.map((token, tokenIndex) => {
      const length = (weights[lineIndex][tokenIndex] / weightSum) * total;
      let start = at(cursor);
      cursor += length;
      let end = at(cursor - Math.min(0.02, length * 0.1));
      // A word never straddles a pause: it goes wholly into the region holding most of it.
      if (end.region !== start.region) {
        const inStart = regions[start.region].end - start.time;
        const inEnd = end.time - regions[end.region].start;
        if (inEnd > inStart) start = {region: end.region, time: regions[end.region].start};
        else end = {region: start.region, time: regions[start.region].end};
      }
      const from = ceil(start.time);
      return {w: token, start: from, end: Math.max(from, floor(end.time))};
    });
    return {text: tokens.join(' '), start: words[0].start, end: words[words.length - 1].end, words};
  });
};

/** Speech regions from ffmpeg silencedetect output ("silence_start: x" / "silence_end: y"). */
export const speechFromSilences = (log: string, duration: number, minSpeech = 0.12): SpeechSegment[] => {
  const silences: SpeechSegment[] = [];
  let open: number | null = null;
  for (const match of log.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const time = Math.max(0, Number(match[2]));
    if (match[1] === 'start') open = time;
    else {
      silences.push({start: open ?? 0, end: time});
      open = null;
    }
  }
  if (open !== null) silences.push({start: open, end: duration});
  const speech: SpeechSegment[] = [];
  let cursor = 0;
  for (const silence of silences) {
    if (silence.start - cursor >= minSpeech) speech.push({start: round3(cursor), end: round3(silence.start)});
    cursor = Math.max(cursor, silence.end);
  }
  if (duration - cursor >= minSpeech) speech.push({start: round3(cursor), end: round3(duration)});
  return speech;
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

// Frames -----------------------------------------------------------------------------------------

export type CaptionWord = {text: string; startFrame: number; endFrame: number};
export type CaptionLine = {text: string; startFrame: number; endFrame: number; words: CaptionWord[]};

export const secondsToFrame = (seconds: number, fps: number) => Math.round(seconds * fps);

/**
 * Caption lines in frames, in order and never overlapping. A line stays up until the next one
 * starts (or `hold` seconds after it ends), so short lines remain readable between phrases.
 */
export const captionLines = (timing: Pick<VoiceoverTiming, 'lines'>, fps: number, {offsetFrames = 0, hold = 0.6} = {}): CaptionLine[] => {
  const lines = [...timing.lines].sort((a, b) => a.start - b.start);
  return lines.map((line, index) => {
    const next = lines[index + 1];
    const startFrame = secondsToFrame(line.start, fps) + offsetFrames;
    const holdUntil = secondsToFrame(line.end + hold, fps) + offsetFrames;
    const endFrame = Math.max(startFrame + 1, next ? Math.min(holdUntil, secondsToFrame(next.start, fps) + offsetFrames) : holdUntil);
    return {
      text: line.text,
      startFrame,
      endFrame,
      words: line.words.map((word) => ({
        text: word.w,
        startFrame: secondsToFrame(word.start, fps) + offsetFrames,
        endFrame: Math.max(secondsToFrame(word.start, fps) + 1, secondsToFrame(word.end, fps)) + offsetFrames,
      })),
    };
  });
};

export const captionAt = (lines: readonly CaptionLine[], frame: number) =>
  lines.find((line) => frame >= line.startFrame && frame < line.endFrame) ?? null;

/** Speech regions as [start, end) frames: lines when there is a transcript, else detected speech. */
export const speechFrames = (timing: Pick<VoiceoverTiming, 'lines' | 'speech'>, fps: number): [number, number][] => {
  const regions = timing.lines.length > 0 ? timing.lines : timing.speech ?? [];
  return regions.map((region) => [secondsToFrame(region.start, fps), secondsToFrame(region.end, fps)]);
};

// Scenes -----------------------------------------------------------------------------------------

export type VoiceoverScenePlan = {
  id: string;
  durationInFrames: number;
  /** Frame (composition time) the scene's narration starts. */
  speechFrom: number;
  text: string;
};

export type PlanOptions = {
  fps: number;
  /** Seconds of silence before the voiceover starts in the composition. */
  leadIn?: number;
  /** Seconds after the voiceover ends before the video ends. */
  tail?: number;
  /** A pause at least this long (seconds) may start a new scene. */
  minPause?: number;
  /** Scenes shorter than this (seconds) are merged into the previous scene. */
  minScene?: number;
  /** Visuals cut this many seconds before the speech they illustrate. */
  anticipation?: number;
};

/**
 * Scene boundaries from narration: consecutive speech units (transcript lines, or detected speech
 * when there is no transcript) are grouped at natural pauses, each cut lands inside the pause a
 * little before the next phrase, and the last scene ends `tail` after the voice. Durations sum to
 * totalFrames exactly. The recording itself is never stretched or shortened.
 */
export const planScenesFromVoiceover = (
  timing: Pick<VoiceoverTiming, 'lines' | 'speech' | 'duration'>,
  {fps, leadIn = 0, tail = 1, minPause = 0.35, minScene = 1.5, anticipation = 0.15}: PlanOptions,
): {scenes: VoiceoverScenePlan[]; totalFrames: number} => {
  const units = (timing.lines.length > 0 ? timing.lines : (timing.speech ?? []).map((region) => ({...region, text: ''}))).map((unit) => ({
    start: unit.start + leadIn,
    end: unit.end + leadIn,
    text: unit.text,
  }));
  const totalFrames = Math.ceil((timing.duration + leadIn + tail) * fps);
  if (units.length === 0) return {scenes: [{id: 'scene-1', durationInFrames: totalFrames, speechFrom: 0, text: ''}], totalFrames};

  // Group units; a new group starts only after a pause long enough to cut on.
  const groups: {start: number; end: number; text: string[]}[] = [];
  for (const unit of units) {
    const last = groups[groups.length - 1];
    if (last && unit.start - last.end < minPause) {
      last.end = unit.end;
      last.text.push(unit.text);
    } else groups.push({start: unit.start, end: unit.end, text: [unit.text]});
  }
  // Cut points: inside the pause, `anticipation` before the next phrase but never before the
  // previous phrase has ended.
  const cuts = groups.slice(1).map((group, index) => {
    const previousEnd = groups[index].end;
    return Math.max(previousEnd, group.start - anticipation);
  });
  let boundaries = [0, ...cuts.map((time) => Math.round(time * fps)), totalFrames];
  // Merge scenes that would be too short to read.
  const minFrames = Math.round(minScene * fps);
  let merged = true;
  while (merged && boundaries.length > 2) {
    merged = false;
    for (let index = 1; index < boundaries.length - 1; index += 1) {
      const before = boundaries[index] - boundaries[index - 1];
      const after = boundaries[index + 1] - boundaries[index];
      if (before < minFrames || (index === boundaries.length - 2 && after < minFrames)) {
        boundaries = [...boundaries.slice(0, index), ...boundaries.slice(index + 1)];
        merged = true;
        break;
      }
    }
  }
  const scenes = boundaries.slice(0, -1).map((from, index) => {
    const to = boundaries[index + 1];
    const inside = groups.filter((group) => Math.round(group.start * fps) < to && Math.round(group.end * fps) > from);
    const speechFrom = inside.length ? Math.max(from, Math.round(inside[0].start * fps)) : from;
    return {id: `scene-${index + 1}`, durationInFrames: to - from, speechFrom, text: inside.flatMap((group) => group.text).filter(Boolean).join(' ')};
  });
  return {scenes, totalFrames};
};

export type DurationFit =
  | {ok: true; message: string}
  | {ok: false; problem: 'cut-off' | 'long-silence'; message: string; suggestions: string[]};

/**
 * Compares a composition's length with the voiceover it must carry, starting at `leadInFrames`
 * (the VoiceoverTrack `from`). Never proposes editing the recording.
 */
export const checkVoiceoverFit = (audioSeconds: number, compositionFrames: number, fps: number, {tail = 1, slack = 6, leadInFrames = 0} = {}): DurationFit => {
  const lead = leadInFrames / fps;
  const needed = Math.ceil((lead + audioSeconds + tail) * fps);
  const composition = compositionFrames / fps;
  if (compositionFrames < leadInFrames + Math.ceil(audioSeconds * fps)) {
    return {
      ok: false,
      problem: 'cut-off',
      message: `The composition (${composition.toFixed(2)}s) is shorter than the voiceover (${audioSeconds.toFixed(2)}s${lead ? ` starting at ${lead.toFixed(2)}s` : ''}); the narration would be cut off.`,
      suggestions: [
        `Set durationInFrames to ${needed} (${(needed / fps).toFixed(2)}s: ${lead ? 'the lead-in, ' : ''}the voiceover, and a ${tail}s tail).`,
        'Or ask the owner for a shorter recording; the recording itself is never trimmed or sped up automatically.',
      ],
    };
  }
  if (composition - lead - audioSeconds > slack) {
    return {
      ok: false,
      problem: 'long-silence',
      message: `The composition runs ${(composition - lead - audioSeconds).toFixed(2)}s past the end of the voiceover.`,
      suggestions: [`Shorten durationInFrames to about ${needed}, or plan a deliberate silent ending (music, end card).`],
    };
  }
  return {ok: true, message: `The voiceover (${audioSeconds.toFixed(2)}s) fits the composition (${composition.toFixed(2)}s).`};
};

/**
 * Music volume at a frame: fades in and out at the edges and ducks under speech, with short ramps
 * so the voice stays intelligible. Frame-pure.
 */
export const duckedVolume = (
  frame: number,
  {
    base,
    ducked,
    speech,
    durationInFrames,
    fadeIn = 15,
    fadeOut = 30,
    ramp = 8,
  }: {base: number; ducked: number; speech: readonly [number, number][]; durationInFrames: number; fadeIn?: number; fadeOut?: number; ramp?: number},
) => {
  const edge = Math.min(1, fadeIn > 0 ? frame / fadeIn : 1, fadeOut > 0 ? (durationInFrames - frame) / fadeOut : 1);
  let duck = 0;
  for (const [start, end] of speech) {
    const into = ramp > 0 ? (frame - (start - ramp)) / ramp : frame >= start ? 1 : 0;
    const outOf = ramp > 0 ? (end + ramp - frame) / ramp : frame < end ? 1 : 0;
    duck = Math.max(duck, Math.min(1, Math.max(0, Math.min(into, outOf))));
  }
  return Math.max(0, edge) * (base + (ducked - base) * duck);
};
