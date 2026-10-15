import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {AssetError, detectMediaTools, parseSvg} from '../../scripts/media/inspect';
import {checkAssets, importAsset, importDirectory, loadManifest, saveManifest, sha256} from '../../scripts/media/library';
import {encodePng} from '../../scripts/media/png';
import {alignVoiceover, runForcedAligner} from '../../scripts/media/voiceover';
import type {AudioMetadata, ImageMetadata, TextMetadata, VideoMetadata} from '../motion/media/manifest';
import type {VoiceoverTiming} from '../motion/media/timing';

// Import and voiceover workflows against a throwaway workspace with generated media only. Tests
// that need real decoding run when FFmpeg is installed (it is a documented dependency).

const tools = detectMediaTools();
const hasFfmpeg = Boolean(tools.ffmpeg && tools.ffprobe);
const knownProjects = new Set(['demo', 'other']);
let root = '';
let sources = '';

const src = (name: string) => path.join(sources, name);

const expectCode = (fn: () => unknown, code: AssetError['code']) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AssetError);
    expect((error as AssetError).code).toBe(code);
    return error as AssetError;
  }
  throw new Error(`expected AssetError ${code}`);
};

const ffmpeg = (args: string[]) => {
  const result = spawnSync(tools.ffmpeg!, ['-v', 'error', '-y', '-nostdin', ...args], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr);
};

const transparent = (width: number, height: number) => encodePng(width, height, (x, y) => (x > width / 4 && x < (width * 3) / 4 && y > height / 4 ? [200, 60, 60, 255] : [0, 0, 0, 0]));
const opaque = (width: number, height: number, shade = 90) => encodePng(width, height, () => [shade, 120, 200, 255]);
const importOf = (file: string, extra: Partial<Parameters<typeof importAsset>[0]> = {}) => importAsset({root, projectId: 'demo', file, tools, knownProjects, ...extra});

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'abud-media-test-'));
  sources = path.join(root, 'owner-files');
  mkdirSync(path.join(root, 'public'), {recursive: true});
  mkdirSync(path.join(sources, 'a'), {recursive: true});
  mkdirSync(path.join(sources, 'b'), {recursive: true});
  writeFileSync(src('character.png'), transparent(300, 600));
  writeFileSync(src('desktop screen.png'), opaque(1600, 900));
  writeFileSync(src('a/logo.png'), opaque(200, 200, 10));
  writeFileSync(src('b/logo.png'), opaque(200, 200, 250));
  const truncated = opaque(400, 300);
  writeFileSync(src('truncated.png'), truncated.subarray(0, truncated.length - 20));
  writeFileSync(src('noise.mp3'), Buffer.from(Array.from({length: 4096}, (_, index) => (index * 97) % 251)));
  writeFileSync(src('picture.gif'), Buffer.from('GIF89a'));
  writeFileSync(src('script.txt'), 'أهلاً بيكم في ABUD Motion Studio\nالخطة جاهزة\n', 'utf8');
  writeFileSync(src('safe.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#09f"/></svg>');
  writeFileSync(src('evil.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  writeFileSync(src('bad-timing.json'), JSON.stringify({duration: 2, lines: [{text: 'a b', start: 1.5, end: 1, words: []}]}));
  if (hasFfmpeg) {
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-ar', '44100', '-ac', '2', src('voice.wav')]);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=2.25', '-c:a', 'libmp3lame', '-b:a', '96k', src('narration.mp3')]);
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', src('clip.mp4')]);
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=1', '-frames:v', '1', src('phone.jpg')]);
    // Speech-like bursts separated by silence, for pause detection.
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=250:duration=6', '-af', "volume='if(lt(mod(t,2),1.4),0.7,0)':eval=frame", '-ar', '16000', src('bursts.wav')]);
    writeFileSync(src('voice-renamed.png'), readFileSync(src('voice.wav')));
    writeFileSync(src('fake.wav'), readFileSync(src('character.png')));
  }
});

afterAll(() => {
  if (root) rmSync(root, {recursive: true, force: true});
});

describe('asset import', () => {
  it('imports a transparent PNG with metadata, preserving the original', () => {
    const before = {hash: sha256(src('character.png')), mtime: statSync(src('character.png')).mtimeMs};
    const result = importOf(src('character.png'), {role: 'character'});
    expect(result.status).toBe('imported');
    const meta = result.asset.metadata as ImageMetadata;
    expect(meta).toMatchObject({format: 'png', width: 300, height: 600, orientation: 'portrait', hasAlpha: true, aspectRatio: 0.5});
    expect(result.asset.file).toBe('user-assets/demo/images/character.png');
    expect(result.asset.sourcePath).toBe(path.resolve(src('character.png')));
    expect(sha256(path.join(root, 'public', result.asset.file))).toBe(before.hash);
    expect(sha256(src('character.png'))).toBe(before.hash);
    expect(statSync(src('character.png')).mtimeMs).toBe(before.mtime);
    expect(result.asset.verified).toBe(hasFfmpeg ? 'decoded' : 'header');
    expect(loadManifest(root, 'demo').assets.map((asset) => asset.id)).toContain('character');
  });

  it('detects landscape images and infers the screenshot role from the name', () => {
    const result = importOf(src('desktop screen.png'));
    expect(result.asset.role).toBe('screenshot');
    expect(result.asset.id).toBe('desktop-screen');
    expect(result.asset.metadata).toMatchObject({orientation: 'landscape', hasAlpha: false});
  });

  it('gives same-named different files distinct ids and never overwrites', () => {
    const first = importOf(src('a/logo.png'));
    const second = importOf(src('b/logo.png'));
    expect([first.asset.id, second.asset.id]).toEqual(['logo', 'logo-2']);
    expect(sha256(path.join(root, 'public', first.asset.file))).toBe(sha256(src('a/logo.png')));
    expect(sha256(path.join(root, 'public', second.asset.file))).toBe(sha256(src('b/logo.png')));
    // Identical content is recognised, not copied again.
    const again = importOf(src('a/logo.png'));
    expect(again.status).toBe('already-imported');
    expect(readdirSync(path.join(root, 'public/user-assets/demo/images')).filter((name) => name.startsWith('logo'))).toHaveLength(2);
    // An explicit id that is taken is refused rather than renamed or replaced.
    writeFileSync(src('logo-new.png'), opaque(10, 10, 33));
    expectCode(() => importOf(src('logo-new.png'), {id: 'logo'}), 'duplicate-id');
  });

  it('refuses missing, unsupported, corrupt, and mismatched files', () => {
    expectCode(() => importOf(src('does-not-exist.png')), 'missing-file');
    expectCode(() => importOf(sources), 'not-a-file');
    expectCode(() => importOf(src('picture.gif')), 'unsupported-format');
    expectCode(() => importOf(src('truncated.png')), 'corrupt');
    expectCode(() => importOf(src('noise.mp3')), hasFfmpeg ? 'corrupt' : 'missing-dependency');
    expectCode(() => importOf(src('character.png'), {role: 'voiceover'}), 'invalid-role');
    expectCode(() => importOf(src('character.png'), {role: 'banana'}), 'invalid-role');
    expectCode(() => importOf(src('bad-timing.json')), 'invalid-timing');
    // Nothing from a failed import is left behind.
    expect(loadManifest(root, 'demo').assets.some((asset) => /truncated|noise|picture|timing/.test(asset.id))).toBe(false);
  });

  it('refuses unsafe projects, ids, and paths', () => {
    expectCode(() => importOf(src('character.png'), {projectId: '../escape'}), 'unsafe-path');
    expectCode(() => importOf(src('character.png'), {projectId: 'not-registered'}), 'unknown-project');
    expectCode(() => importOf(src('character.png'), {id: '../evil'}), 'invalid-id');
    expectCode(() => importOf(src('character.png'), {id: 'Upper Case'}), 'invalid-id');
    const imported = path.join(root, 'public', loadManifest(root, 'demo').assets[0].file);
    expectCode(() => importOf(imported), 'unsafe-path');
  });

  it('accepts passive SVG and refuses SVG with scripts or external references', () => {
    expect(importOf(src('safe.svg'), {role: 'logo'}).asset.metadata).toMatchObject({format: 'svg', width: 120, height: 60});
    expectCode(() => importOf(src('evil.svg')), 'unsafe-svg');
    expect(() => parseSvg('<svg width="1" height="1"><image href="https://example.com/x.png"/></svg>')).toThrow(/external reference/);
    expect(() => parseSvg('<svg width="1" height="1" onload="x()"></svg>')).toThrow(/event handler/);
    expect(() => parseSvg('<svg><rect/></svg>')).toThrow(/no usable size/);
  });

  it('keeps assets with the project that imported them', () => {
    const other = importAsset({root, projectId: 'other', file: src('character.png'), tools, knownProjects});
    expect(other.status).toBe('imported');
    expect(other.asset.file.startsWith('user-assets/other/')).toBe(true);
    expect(loadManifest(root, 'other').assets).toHaveLength(1);
    expect(loadManifest(root, 'demo').assets.filter((asset) => asset.file.startsWith('user-assets/other/'))).toEqual([]);
  });

  it('imports UTF-8 transcripts with their reading direction', () => {
    const result = importOf(src('script.txt'));
    expect(result.asset.role).toBe('transcript');
    expect(result.asset.metadata as TextMetadata).toMatchObject({format: 'plain', lines: 2, direction: 'rtl'});
    writeFileSync(src('latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    expectCode(() => importOf(src('latin1.txt')), 'corrupt');
  });

  it('without FFmpeg, refuses audio and video with setup instructions but still header-checks images', () => {
    const none = {ffprobe: null, ffmpeg: null};
    writeFileSync(src('another.png'), opaque(64, 32, 7));
    const image = importOf(src('another.png'), {tools: none});
    expect(image.asset.verified).toBe('header');
    expect(image.warnings.join(' ')).toMatch(/not decoded/);
    if (hasFfmpeg) {
      const error = expectCode(() => importOf(src('voice.wav'), {tools: none}), 'missing-dependency');
      expect(error.message).toMatch(/winget install Gyan.FFmpeg/);
    }
    expect(detectMediaTools({ABUD_FFPROBE: 'definitely-not-ffprobe-xyz', ABUD_FFMPEG: 'nope-xyz'})).toEqual({ffprobe: null, ffmpeg: null});
  });

  it('rejects a manifest that is not valid instead of overwriting it', () => {
    const file = path.join(root, 'public/user-assets/broken/assets.json');
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, '{not json');
    expectCode(() => loadManifest(root, 'broken'), 'invalid-manifest');
    expect(readFileSync(file, 'utf8')).toBe('{not json');
  });

  it('hashes in chunks exactly like a one-shot hash', async () => {
    const {createHash} = await import('node:crypto');
    const big = Buffer.alloc(9 * 2 ** 20 + 123, 7);
    big[5_000_000] = 1;
    writeFileSync(src('big.bin'), big);
    expect(sha256(src('big.bin'))).toBe(createHash('sha256').update(big).digest('hex'));
  });

  it('reports files that went missing or changed after import', () => {
    const manifest = loadManifest(root, 'demo');
    const checks = checkAssets(root, {...manifest, assets: [...manifest.assets, {...manifest.assets[0], id: 'ghost', file: 'user-assets/demo/images/ghost.png'}]}, {hash: true});
    expect(checks.find((check) => check.asset.id === 'ghost')?.present).toBe(false);
    expect(checks.find((check) => check.asset.id === manifest.assets[0].id)?.intact).toBe(true);
  });
});

describe.skipIf(!hasFfmpeg)('audio and video import (FFmpeg)', () => {
  it('measures audio duration accurately and keeps the recording unchanged', () => {
    const before = sha256(src('voice.wav'));
    const result = importOf(src('voice.wav'), {role: 'voiceover', id: 'vo'});
    const meta = result.asset.metadata as AudioMetadata;
    expect(meta.durationSeconds).toBeCloseTo(1.5, 2);
    expect(meta).toMatchObject({channels: 2, sampleRate: 44100, codec: 'pcm_s16le'});
    expect(result.asset.browserPreview).toBe(true);
    expect(sha256(src('voice.wav'))).toBe(before);
    expect(sha256(path.join(root, 'public', result.asset.file))).toBe(before);
    const mp3 = importOf(src('narration.mp3'), {role: 'voiceover', id: 'narration'});
    expect((mp3.asset.metadata as AudioMetadata).durationSeconds).toBeGreaterThan(2.2);
    expect((mp3.asset.metadata as AudioMetadata).durationSeconds).toBeLessThan(2.35);
  });

  it('reads video resolution, frame rate, and tracks', () => {
    const result = importOf(src('clip.mp4'), {role: 'footage'});
    expect(result.asset.metadata as VideoMetadata).toMatchObject({width: 320, height: 240, fps: 25, codec: 'h264', hasAudio: false});
    expect((result.asset.metadata as VideoMetadata).durationSeconds).toBeCloseTo(1, 1);
  });

  it('decodes JPEG screenshots and catches files whose content does not match the name', () => {
    expect(importOf(src('phone.jpg')).asset.metadata).toMatchObject({format: 'jpeg', width: 720, height: 1280, orientation: 'portrait'});
    expectCode(() => importOf(src('voice-renamed.png')), 'corrupt');
    expectCode(() => importOf(src('fake.wav')), 'corrupt');
  });

  it('imports a folder, skipping unsupported files and reporting failures without stopping', () => {
    const folder = path.join(sources, 'drop');
    mkdirSync(folder, {recursive: true});
    writeFileSync(path.join(folder, 'bgm.wav'), readFileSync(src('voice.wav')).subarray(0)); // identical to vo → recognised
    writeFileSync(path.join(folder, 'notes.docx'), 'x');
    writeFileSync(path.join(folder, 'broken.png'), Buffer.from('not a png'));
    writeFileSync(path.join(folder, 'hero.png'), transparent(100, 200));
    const result = importDirectory({root, projectId: 'demo', dir: folder, tools, knownProjects});
    expect(result.imported.map((item) => item.status).sort()).toEqual(['already-imported', 'imported']);
    expect(result.failed.map((item) => item.code)).toEqual(['corrupt']);
    expect(result.skipped.map((file) => path.basename(file))).toEqual(['notes.docx']);
  });
});

describe.skipIf(!hasFfmpeg)('voiceover timing (project-scoped)', () => {
  const manifestFor = (projectId: string) => loadManifest(root, projectId);
  const setup = (projectId: string) => {
    const vo = importAsset({root, projectId, file: src('bursts.wav'), role: 'voiceover', id: 'vo', tools, knownProjects});
    expect((vo.asset.metadata as AudioMetadata).durationSeconds).toBeCloseTo(6, 1);
    writeFileSync(src(`${projectId}-script.txt`), 'First phrase here\nSecond phrase now\nالجملة الثالثة\n', 'utf8');
    importAsset({root, projectId, file: src(`${projectId}-script.txt`), role: 'transcript', id: 'script', tools, knownProjects});
  };
  const fresh = (projectId: string) => {
    rmSync(path.join(root, 'public/user-assets', projectId), {recursive: true, force: true});
    setup(projectId);
  };

  it('records speech segments only when there is no transcript, and never invents words', () => {
    rmSync(path.join(root, 'public/user-assets/other'), {recursive: true, force: true});
    importAsset({root, projectId: 'other', file: src('bursts.wav'), role: 'voiceover', id: 'vo', tools, knownProjects});
    const result = alignVoiceover({root, manifest: manifestFor('other'), aligner: 'auto', language: 'eng', tools});
    expect(result.timing.method).toBe('speech-segments');
    expect(result.timing.lines).toEqual([]);
    expect(result.timing.speech?.length).toBe(3);
    expect(result.notes.join(' ')).toMatch(/No transcript/);
    expect(result.file).toBe('user-assets/other/timing/vo.json');
  });

  it('uses forced alignment when the aligner succeeds and writes timing per project', () => {
    fresh('demo');
    const lines = [
      {text: 'First phrase here', start: 0.05, end: 1.35, words: [{w: 'First', start: 0.05, end: 0.4, conf: 0.9}, {w: 'phrase', start: 0.45, end: 0.9, conf: 0.9}, {w: 'here', start: 0.95, end: 1.35, conf: 0.1}]},
      {text: 'Second phrase now', start: 2.05, end: 3.3, words: [{w: 'Second', start: 2.05, end: 2.5}, {w: 'phrase', start: 2.55, end: 2.9}, {w: 'now', start: 2.95, end: 3.3}]},
      {text: 'الجملة الثالثة', start: 4.05, end: 5.3, words: [{w: 'الجملة', start: 4.05, end: 4.6}, {w: 'الثالثة', start: 4.65, end: 5.3}]},
    ];
    let received = '';
    const result = alignVoiceover({
      root, manifest: manifestFor('demo'), aligner: 'auto', language: 'ara', tools,
      forcedAligner: ({transcriptText}) => {
        received = transcriptText;
        return {ok: true, lines, source: 'fake aligner'};
      },
    });
    expect(received).toBe('First phrase here\nSecond phrase now\nالجملة الثالثة');
    expect(result.timing.method).toBe('forced-alignment');
    expect(result.timing.lowConfidence).toEqual(['here']);
    expect(result.notes.join(' ')).toMatch(/low-confidence/);
    const saved = JSON.parse(readFileSync(path.join(root, 'public', result.file), 'utf8')) as VoiceoverTiming;
    expect(saved.voiceover).toBe('vo');
    expect(saved.audio).toBe('user-assets/demo/audio/vo.wav');
    expect(manifestFor('demo').assets.find((asset) => asset.id === 'vo')?.timing).toMatchObject({file: 'user-assets/demo/timing/vo.json', method: 'forced-alignment', lowConfidenceWords: 1});
    // The other project's timing is untouched.
    expect(JSON.parse(readFileSync(path.join(root, 'public/user-assets/other/timing/vo.json'), 'utf8')).method).toBe('speech-segments');
    expect(existsSync(path.join(root, 'src/motion/data/words.json'))).toBe(false);
  });

  it('falls back to labelled estimates when the aligner is unavailable, or stops if it was required', () => {
    fresh('demo');
    const unavailable = () => ({ok: false as const, reason: 'uv is offline and the model is not cached'});
    const estimated = alignVoiceover({root, manifest: manifestFor('demo'), aligner: 'auto', language: 'ara', tools, forcedAligner: unavailable});
    expect(estimated.timing.method).toBe('estimated');
    expect(estimated.timing.source).toMatch(/estimate/);
    expect(estimated.notes.join(' ')).toMatch(/ESTIMATES/);
    expect(estimated.timing.lines).toHaveLength(3);
    expectCode(() => alignVoiceover({root, manifest: manifestFor('demo'), aligner: 'mms', language: 'ara', tools, forcedAligner: unavailable}), 'missing-dependency');
  });

  it('rejects aligner output that does not fit the audio and keeps the previous timing', () => {
    fresh('demo');
    alignVoiceover({root, manifest: manifestFor('demo'), aligner: 'none', language: 'eng', tools});
    const before = readFileSync(path.join(root, 'public/user-assets/demo/timing/vo.json'), 'utf8');
    const broken = () => ({ok: true as const, source: 'broken', lines: [{text: 'late', start: 9, end: 12, words: [{w: 'late', start: 9, end: 12}]}]});
    expectCode(() => alignVoiceover({root, manifest: manifestFor('demo'), aligner: 'auto', language: 'eng', tools, forcedAligner: broken}), 'invalid-timing');
    expect(readFileSync(path.join(root, 'public/user-assets/demo/timing/vo.json'), 'utf8')).toBe(before);
  });

  it('adopts owner-supplied timing JSON after validating it', () => {
    fresh('demo');
    const owner = {duration: 6, lines: [{text: 'Owner timed', start: 0.1, end: 1.2, words: [{w: 'Owner', start: 0.1, end: 0.6}, {w: 'timed', start: 0.7, end: 1.2}]}]};
    writeFileSync(src('owner-timing.json'), JSON.stringify(owner));
    importAsset({root, projectId: 'demo', file: src('owner-timing.json'), role: 'timing', id: 'owner-timing', tools, knownProjects});
    const result = alignVoiceover({root, manifest: manifestFor('demo'), timingId: 'owner-timing', aligner: 'none', language: 'eng', tools});
    expect(result.timing.method).toBe('owner-supplied');
    expect(result.timing.lines[0].text).toBe('Owner timed');
  });

  it('can time a voiceover without the transcript the project also holds', () => {
    fresh('demo');
    const result = alignVoiceover({root, manifest: manifestFor('demo'), transcriptId: null, aligner: 'auto', language: 'eng', tools});
    expect(result.timing.method).toBe('speech-segments');
    expect(result.timing.lines).toEqual([]);
  });

  it('saves manifests atomically (no temp files left behind)', () => {
    saveManifest(root, manifestFor('demo'));
    expect(readdirSync(path.join(root, 'public/user-assets/demo')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

// Real forced alignment (≈20–60 s): opt in with ABUD_TEST_ALIGNER=1 on Windows, where speech
// synthesis provides a real English voice. Uses only the cached aligner (uv --offline).
describe.skipIf(!process.env.ABUD_TEST_ALIGNER || process.platform !== 'win32' || !hasFfmpeg)('real MMS forced alignment', () => {
  it('aligns a synthesized English voiceover to its transcript within the audio', () => {
    const wav = src('sapi.wav');
    const text = 'Every frame comes from the timeline. Captions follow the voice.';
    const speak = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak('${text}'); $s.Dispose()`], {encoding: 'utf8'});
    expect(speak.status).toBe(0);
    rmSync(path.join(root, 'public/user-assets/other'), {recursive: true, force: true});
    importAsset({root, projectId: 'other', file: wav, role: 'voiceover', id: 'vo', tools, knownProjects});
    writeFileSync(src('sapi.txt'), 'Every frame comes from the timeline.\nCaptions follow the voice.\n');
    importAsset({root, projectId: 'other', file: src('sapi.txt'), role: 'transcript', id: 'script', tools, knownProjects});
    // align.py lives in the real checkout; the workspace only holds media.
    const repo = path.resolve(__dirname, '..', '..');
    const result = alignVoiceover({
      root, manifest: loadManifest(root, 'other'), aligner: 'mms', language: 'eng', tools,
      forcedAligner: (options) => runForcedAligner({...options, root: repo}),
    });
    expect(result.timing.method).toBe('forced-alignment');
    const words = result.timing.lines.flatMap((line) => line.words);
    expect(words.map((word) => word.w).join(' ')).toBe(text);
    for (const word of words) {
      expect(word.end).toBeGreaterThan(word.start);
      expect(word.end).toBeLessThanOrEqual(result.timing.duration + 0.25);
    }
    // Words sit inside detected speech (with a small tolerance for edges).
    for (const word of words) expect(result.timing.speech!.some((region) => word.start >= region.start - 0.15 && word.end <= region.end + 0.15)).toBe(true);
  }, 300_000);
});
