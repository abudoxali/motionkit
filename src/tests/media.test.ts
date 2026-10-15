import {describe, expect, it} from 'vitest';
import {rigIssues} from '../motion/media/Character';
import {deviceLayout, entranceAt, fitRect, idleAt, imageToScreen, poseAt, transformAt, zoomAt, zoomedRect} from '../motion/media/geometry';
import {assetFilePath, assetIdFromName, inferRole, timingPath, uniqueAssetId, validateManifest} from '../motion/media/manifest';
import type {AssetManifest} from '../motion/media/manifest';
import {
  captionAt,
  captionLines,
  checkVoiceoverFit,
  duckedVolume,
  estimateTimings,
  isWordAccurate,
  lowConfidenceWords,
  planScenesFromVoiceover,
  speechFromSilences,
  transcriptLines,
  validateTiming,
} from '../motion/media/timing';
import type {VoiceoverTiming} from '../motion/media/timing';
import {validateProject} from '../projects/contract';
import type {ProjectDefinition} from '../projects/contract';
import {mediaFixtureMeta} from '../projects/fixtures/media';

const timing = (lines: VoiceoverTiming['lines'], duration = 10, method: VoiceoverTiming['method'] = 'forced-alignment'): VoiceoverTiming => ({
  version: 1, method, source: 'test', voiceover: 'vo', audio: 'user-assets/demo/audio/vo.mp3', duration, lines,
});
const line = (text: string, start: number, end: number) => {
  const words = text.split(' ');
  const step = (end - start) / words.length;
  return {text, start, end, words: words.map((w, index) => ({w, start: start + index * step, end: start + (index + 1) * step - 0.01, conf: 0.9}))};
};

describe('asset manifest', () => {
  it('derives portable ids and resolves collisions without exceeding the length limit', () => {
    expect(assetIdFromName('My App Screen (1)')).toBe('my-app-screen-1');
    expect(assetIdFromName('Écran-Résumé')).toBe('ecran-resume');
    expect(assetIdFromName('صوت المعلق')).toBeNull();
    expect(assetIdFromName('2024 logo')).toBe('logo');
    const taken = new Set(['logo', 'logo-2']);
    expect(uniqueAssetId('logo', (id) => taken.has(id))).toBe('logo-3');
    const long = 'a'.repeat(48);
    const next = uniqueAssetId(long, (id) => id === long);
    expect(next).toHaveLength(48);
    expect(next.endsWith('-2')).toBe(true);
  });

  it('keeps every project in its own folder and timing out of a shared words.json', () => {
    expect(assetFilePath('demo', 'audio', 'vo', '.MP3')).toBe('user-assets/demo/audio/vo.mp3');
    expect(timingPath('demo', 'vo')).toBe('user-assets/demo/timing/vo.json');
    expect(timingPath('other', 'vo')).not.toBe(timingPath('demo', 'vo'));
  });

  it('infers roles from names but only within the file kind', () => {
    expect(inferRole('elevenlabs-voice.mp3', 'audio')).toBe('voiceover');
    expect(inferRole('bgm.wav', 'audio')).toBe('music');
    expect(inferRole('home screen.png', 'image')).toBe('screenshot');
    expect(inferRole('mascot.png', 'image')).toBe('character');
    expect(inferRole('script.txt', 'text')).toBe('transcript');
    expect(inferRole('captions.srt', 'text')).toBe('captions');
    expect(inferRole('voice.png', 'image')).not.toBe('voiceover');
  });

  it('rejects manifests with unsafe paths, foreign projects, and role/kind mismatches', () => {
    const asset = {id: 'vo', kind: 'audio', role: 'voiceover', file: 'user-assets/demo/audio/vo.mp3', license: 'Owner', originalName: 'vo.mp3', sizeBytes: 1, sha256: 'x', sourcePath: 'C:/x', importedAt: '', verified: 'decoded', browserPreview: true, metadata: {durationSeconds: 2}};
    const manifest = {version: 1, projectId: 'demo', assets: [asset]} as unknown as AssetManifest;
    expect(validateManifest(manifest, 'demo')).toEqual([]);
    expect(validateManifest(manifest, 'other')[0].message).toMatch(/belongs to "demo"/);
    const bad = (patch: Record<string, unknown>) => validateManifest({...manifest, assets: [{...asset, ...patch}]}, 'demo').map((issue) => issue.message).join(' ');
    expect(bad({file: '../secret.mp3'})).toMatch(/relative to public/);
    expect(bad({file: 'user-assets/other/audio/vo.mp3'})).toMatch(/must live under/);
    expect(bad({role: 'screenshot'})).toMatch(/needs a image file/);
    expect(bad({license: ' '})).toMatch(/license/);
    expect(validateManifest({...manifest, assets: [asset, asset]}, 'demo')[0].message).toMatch(/duplicate/);
  });
});

describe('voiceover timing', () => {
  it('reads transcripts like align.py: tags and ellipses removed, Arabic and English words kept whole', () => {
    expect(transcriptLines('\uFEFF[excited] Hello... world!\n\n  الخطة جاهزة في MP4 —  \n')).toEqual([['Hello', 'world!'], ['الخطة', 'جاهزة', 'في', 'MP4']]);
  });

  it('accepts valid timing and rejects malformed, unordered, or out-of-audio timing', () => {
    const good = timing([line('one two three', 0.5, 2), line('four five', 2.5, 4)], 5);
    expect(validateTiming(good, 5).filter((issue) => issue.severity === 'error')).toEqual([]);
    const errors = (value: unknown, audio?: number) => validateTiming(value, audio).filter((issue) => issue.severity === 'error').map((issue) => issue.message).join(' | ');
    expect(errors({lines: []})).toMatch(/duration/);
    expect(errors(timing([line('a b', 3, 2)]))).toMatch(/invalid start\/end/);
    expect(errors(timing([line('a b', 2, 3), line('c d', 1, 1.5)]))).toMatch(/before the previous line/);
    expect(errors(timing([line('a b', 4, 6)], 5), 5)).toMatch(/after the audio/);
    expect(errors(timing([line('a b', 1, 2)], 9), 5)).toMatch(/does not match the audio/);
    expect(errors(timing([{text: 'x', start: 0, end: 1, words: []}]))).toMatch(/words are required/);
    expect(errors(timing([{text: 'x y', start: 0, end: 1, words: [{w: 'x', start: 0.5, end: 0.9}, {w: 'y', start: 0.1, end: 0.3}]}]))).toMatch(/out of order/);
    // A collapsed alignment is flagged for review, not silently accepted.
    const collapsed = timing([{text: 'a b c d', start: 1, end: 1.1, words: ['a', 'b', 'c', 'd'].map((w) => ({w, start: 1, end: 1.1}))}]);
    expect(validateTiming(collapsed).some((issue) => issue.severity === 'warning' && /collapsed/.test(issue.message))).toBe(true);
  });

  it('lists low-confidence words and knows which methods are word accurate', () => {
    const value = timing([{text: 'clear mumble', start: 0, end: 1, words: [{w: 'clear', start: 0, end: 0.4, conf: 0.95}, {w: 'mumble', start: 0.5, end: 0.9, conf: 0.05}]}]);
    expect(lowConfidenceWords(value)).toEqual(['mumble']);
    expect(isWordAccurate({method: 'forced-alignment'})).toBe(true);
    expect(isWordAccurate({method: 'owner-supplied'})).toBe(true);
    expect(isWordAccurate({method: 'estimated'})).toBe(false);
    expect(isWordAccurate({method: 'speech-segments'})).toBe(false);
  });

  it('turns ffmpeg silencedetect output into speech regions', () => {
    const log = '[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.4 | silence_duration: 0.4\nsilence_start: 2.1\nsilence_end: 2.9\nsilence_start: 5.5\n';
    expect(speechFromSilences(log, 6)).toEqual([{start: 0.4, end: 2.1}, {start: 2.9, end: 5.5}]);
    expect(speechFromSilences('', 3)).toEqual([{start: 0, end: 3}]);
  });

  it('estimates words only inside detected speech, in order, and valid against the audio', () => {
    const speech = [{start: 0.5, end: 2}, {start: 3, end: 5}];
    const lines = estimateTimings([['مرحبا', 'بكم'], ['in', 'ABUD', 'Studio']], speech, 6);
    const words = lines.flatMap((item) => item.words);
    for (let index = 1; index < words.length; index += 1) expect(words[index].start).toBeGreaterThanOrEqual(words[index - 1].end - 1e-9);
    for (const word of words) expect(speech.some((region) => word.start >= region.start - 1e-9 && word.end <= region.end + 1e-9)).toBe(true);
    expect(validateTiming(timing(lines, 6, 'estimated'), 6).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(lines[0].text).toBe('مرحبا بكم');
  });

  it('builds ordered, non-overlapping caption lines with words in frames', () => {
    const value = timing([line('second line', 3, 4), line('first line here', 0.5, 2.5)]);
    const lines = captionLines(value, 30, {offsetFrames: 15});
    expect(lines.map((item) => item.text)).toEqual(['first line here', 'second line']);
    expect(lines[0].startFrame).toBe(15 + 15);
    expect(lines[0].endFrame).toBeLessThanOrEqual(lines[1].startFrame);
    for (const item of lines) for (const word of item.words) expect(word.endFrame).toBeGreaterThan(word.startFrame);
    expect(captionAt(lines, 40)?.text).toBe('first line here');
    expect(captionAt(lines, 0)).toBeNull();
    // Mixed Arabic and English stays one caption with whole words.
    const mixed = captionLines(timing([line('جرّب ABUD Motion Studio دلوقتي', 0, 2)]), 30);
    expect(mixed[0].words.map((word) => word.text)).toEqual(['جرّب', 'ABUD', 'Motion', 'Studio', 'دلوقتي']);
  });

  it('plans scenes from narration: cuts in pauses, short scenes merged, durations sum exactly', () => {
    const value = timing([line('one', 0.2, 1.6), line('two', 1.7, 3), line('three', 4, 6), line('four', 7.5, 7.9), line('five', 8.6, 9.5)], 10);
    const plan = planScenesFromVoiceover(value, {fps: 30, tail: 1});
    expect(plan.totalFrames).toBe(330);
    expect(plan.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)).toBe(330);
    // "one" and "two" are 0.1 s apart: never split. "four" alone is too short and merges.
    expect(plan.scenes[0].text).toBe('one two');
    for (const scene of plan.scenes) expect(scene.durationInFrames).toBeGreaterThanOrEqual(45);
    let from = 0;
    for (const scene of plan.scenes) {
      const cut = from;
      // Every cut lands in a pause: no line is speaking across it.
      expect(value.lines.some((item) => item.start * 30 < cut - 1 && item.end * 30 > cut + 1)).toBe(false);
      from += scene.durationInFrames;
    }
    // Speech-only (no transcript) still yields a plan from detected regions.
    const segments = planScenesFromVoiceover({lines: [], speech: [{start: 0, end: 2}, {start: 3, end: 6}], duration: 6}, {fps: 30});
    expect(segments.scenes).toHaveLength(2);
  });

  it('reports a duration mismatch instead of touching the recording', () => {
    const short = checkVoiceoverFit(20, 15 * 30, 30);
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.message).toMatch(/cut off/);
      expect(short.suggestions.join(' ')).toMatch(/630/);
      expect(short.suggestions.join(' ')).toMatch(/never trimmed/);
    }
    expect(checkVoiceoverFit(14, 15 * 30, 30).ok).toBe(true);
    expect(checkVoiceoverFit(5, 30 * 30, 30).ok).toBe(false);
  });

  it('ducks music under speech with ramps and fades at the edges', () => {
    const options = {base: 0.2, ducked: 0.05, speech: [[100, 200]] as [number, number][], durationInFrames: 300, fadeIn: 10, fadeOut: 30, ramp: 8};
    expect(duckedVolume(0, options)).toBe(0);
    expect(duckedVolume(50, options)).toBeCloseTo(0.2);
    expect(duckedVolume(150, options)).toBeCloseTo(0.05);
    expect(duckedVolume(96, options)).toBeGreaterThan(0.05);
    expect(duckedVolume(96, options)).toBeLessThan(0.2);
    expect(duckedVolume(299, options)).toBeLessThan(0.02);
    expect(duckedVolume(150, options)).toBe(duckedVolume(150, options));
  });
});

describe('image placement', () => {
  const aspect = (rect: {width: number; height: number}) => rect.width / rect.height;

  it('never distorts: contain fits inside, cover fills and crops around the focus', () => {
    const viewport = {width: 1000, height: 500};
    for (const image of [{width: 1080, height: 2340}, {width: 1920, height: 1080}, {width: 500, height: 500}]) {
      const contain = fitRect(viewport, image, 'contain');
      expect(aspect(contain)).toBeCloseTo(aspect(image), 6);
      expect(contain.width).toBeLessThanOrEqual(1000 + 1e-6);
      expect(contain.height).toBeLessThanOrEqual(500 + 1e-6);
      const cover = fitRect(viewport, image, 'cover', [0.9, 0.1]);
      expect(aspect(cover)).toBeCloseTo(aspect(image), 6);
      expect(cover.x).toBeLessThanOrEqual(0);
      expect(cover.y).toBeLessThanOrEqual(0);
      expect(cover.x + cover.width).toBeGreaterThanOrEqual(1000 - 1e-6);
      expect(cover.y + cover.height).toBeGreaterThanOrEqual(500 - 1e-6);
    }
  });

  it('zooms toward a focus without exposing edges, and maps highlights through the zoom', () => {
    const viewport = {width: 800, height: 600};
    const base = {x: 0, y: 0, ...viewport};
    expect(zoomAt(0, undefined)).toEqual({scale: 1, focus: [0.5, 0.5]});
    const keys = [{frame: 10, scale: 1}, {frame: 30, scale: 2, focus: [0.9, 0.1] as const}];
    expect(zoomAt(0, keys).scale).toBe(1);
    expect(zoomAt(20, keys).scale).toBeGreaterThan(1);
    expect(zoomAt(40, keys)).toEqual({scale: 2, focus: [0.9, 0.1]});
    const zoomed = zoomedRect(base, viewport, zoomAt(30, keys));
    expect(zoomed.x).toBeLessThanOrEqual(0);
    expect(zoomed.y).toBeLessThanOrEqual(0);
    expect(zoomed.x + zoomed.width).toBeGreaterThanOrEqual(800);
    expect(zoomed.y + zoomed.height).toBeGreaterThanOrEqual(600);
    const region = imageToScreen(zoomed, [0.5, 0.5, 0.25, 0.25]);
    expect(region.width).toBeCloseTo(zoomed.width * 0.25);
    expect(region.x).toBeCloseTo(zoomed.x + zoomed.width / 2);
  });

  it('frames portrait and landscape screenshots so the screen matches the image exactly', () => {
    const area = {x: 100, y: 50, width: 1700, height: 900};
    for (const [image, device] of [[1080 / 2340, 'phone'], [1920 / 1080, 'browser'], [16 / 10, 'card'], [1, 'none']] as const) {
      const layout = deviceLayout(area, image, device);
      expect(aspect(layout.screen)).toBeCloseTo(image, 4);
      expect(layout.device.x).toBeGreaterThanOrEqual(area.x - 1e-6);
      expect(layout.device.y).toBeGreaterThanOrEqual(area.y - 1e-6);
      expect(layout.device.x + layout.device.width).toBeLessThanOrEqual(area.x + area.width + 1e-6);
      expect(layout.device.y + layout.device.height).toBeLessThanOrEqual(area.y + area.height + 1e-6);
      expect(layout.screen.x).toBeGreaterThanOrEqual(layout.device.x - 1e-6);
    }
  });
});

describe('character motion', () => {
  it('interpolates paths per property and is deterministic for any frame order', () => {
    const keys = [{frame: 0, x: 0, y: 100}, {frame: 30, x: 300, ease: 'linear' as const}, {frame: 60, rotate: 20}];
    const initial = {x: 9, y: 9, scale: 1, rotate: 0, opacity: 1};
    expect(transformAt(15, keys, initial)).toMatchObject({x: 150, y: 100, scale: 1});
    expect(transformAt(90, keys, initial)).toMatchObject({x: 300, rotate: 20});
    const forward = [0, 17, 33, 59].map((frame) => transformAt(frame, keys, initial));
    const backward = [59, 33, 17, 0].map((frame) => transformAt(frame, keys, initial)).reverse();
    expect(backward).toEqual(forward);
    expect(idleAt(37, {bob: 10, period: 30})).toEqual(idleAt(37, {bob: 10, period: 30}));
    expect(idleAt(15, {bob: 10, period: 30}).y).toBeLessThanOrEqual(0);
  });

  it('enters and exits, switches supplied poses, and validates rigs', () => {
    expect(entranceAt(0, {type: 'fade', frame: 10, duration: 10}, 'in', 50).opacity).toBe(0);
    expect(entranceAt(20, {type: 'rise', frame: 10, duration: 10}, 'in', 50)).toMatchObject({opacity: 1, y: 0});
    expect(entranceAt(20, {type: 'fade', frame: 10, duration: 10}, 'out', 50).opacity).toBe(0);
    const poses = [{asset: 'a', from: 0}, {asset: 'b', from: 45}, {asset: 'c', from: 90}];
    expect([0, 44, 45, 89, 200].map((frame) => poses[poseAt(frame, poses)].asset)).toEqual(['a', 'a', 'b', 'b', 'c']);
    const layer = (id: string, parent?: string) => ({id, parent, asset: id, x: 0, y: 0, width: 10});
    expect(rigIssues([layer('torso'), layer('head', 'torso')])).toEqual([]);
    expect(rigIssues([layer('arm', 'missing')])[0]).toMatch(/unknown parent/);
    expect(rigIssues([layer('a', 'b'), layer('b', 'a')]).join()).toMatch(/cycle/);
    expect(rigIssues([layer('a'), layer('a')])[0]).toMatch(/duplicate/);
  });
});

describe('project media references', () => {
  it('validates media ids in the contract and the media fixture uses them', () => {
    expect(validateProject(mediaFixtureMeta as unknown as ProjectDefinition).filter((issue) => issue.severity === 'error')).toEqual([]);
    const broken = {...(mediaFixtureMeta as unknown as ProjectDefinition), media: {assets: ['ok', 'Not Valid', 'ok'], voiceover: 'absent'}};
    const messages = validateProject(broken).map((issue) => `${issue.path}: ${issue.message}`).join(' | ');
    expect(messages).toMatch(/not a valid asset id/);
    expect(messages).toMatch(/duplicate asset id/);
    expect(messages).toMatch(/media.voiceover: must also be listed/);
  });
});

describe('caption direction', () => {
  it('keeps Arabic narration lines RTL even when Latin names outnumber Arabic letters', async () => {
    const {captionDirection} = await import('../motion/media/Captions');
    expect(captionDirection('جرّب ABUD Motion Studio دلوقتي', 'ara', 'rtl')).toBe('rtl');
    expect(captionDirection('Captions follow the voice', 'ara', 'rtl')).toBe('ltr');
    expect(captionDirection('Import the voiceover first.', 'eng', 'ltr')).toBe('ltr');
    // Without Arabic narration the dominant script decides.
    expect(captionDirection('جرّب ABUD Motion Studio دلوقتي', 'eng', 'rtl')).toBe('ltr');
    expect(captionDirection('١٢٣', undefined, 'rtl')).toBe('rtl');
  });
});

describe('review regressions', () => {
  it('infers roles from whole name tokens, not substrings', () => {
    expect(inferRole('sales-chart.png', 'image')).toBe('illustration');
    expect(inferRole('happy-team.jpg', 'image')).toBe('illustration');
    expect(inferRole('apple.png', 'image')).toBe('illustration');
    expect(inferRole('App Home Screen.png', 'image')).toBe('screenshot');
    expect(inferRole('screens_02.png', 'image')).toBe('screenshot');
    expect(inferRole('hero-pose-b.png', 'image')).toBe('character-pose');
    expect(inferRole('Brand Logo.svg', 'image')).toBe('logo');
    expect(inferRole('promo_vo.mp3', 'audio')).toBe('voiceover');
    expect(inferRole('popular-song.mp3', 'audio')).toBe('music');
    expect(inferRole('episode.srt', 'text')).toBe('captions');
  });

  it('counts the voiceover lead-in when checking the fit', () => {
    const late = checkVoiceoverFit(9.9, 300, 30, {leadInFrames: 15});
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.problem).toBe('cut-off');
      expect(late.suggestions[0]).toMatch(/Set durationInFrames to 342/);
    }
    expect(checkVoiceoverFit(9.9, 300, 30).ok).toBe(true);
    const silent = checkVoiceoverFit(3, 600, 30);
    expect(!silent.ok && silent.problem).toBe('long-silence');
  });

  it('rejects manifest entries whose metadata components cannot lay out', () => {
    const asset = {id: 'shot', kind: 'image', role: 'screenshot', file: 'user-assets/demo/images/shot.png', license: 'Owner', metadata: {width: 0, format: 'png'}};
    const issues = validateManifest({version: 1, projectId: 'demo', assets: [asset]}, 'demo').map((issue) => issue.path);
    expect(issues).toEqual(['assets[0].metadata.width', 'assets[0].metadata.height']);
  });

  it('validates the voiceover start frame in the contract', () => {
    const base = mediaFixtureMeta as unknown as ProjectDefinition;
    const messages = (media: ProjectDefinition['media']) => validateProject({...base, media}).map((issue) => issue.path).join(' ');
    expect(messages({assets: ['vo'], voiceover: 'vo', voiceoverFrom: -1})).toMatch(/media.voiceoverFrom/);
    expect(messages({assets: ['vo'], voiceoverFrom: 10})).toMatch(/media.voiceoverFrom/);
    expect(messages({assets: ['vo'], voiceover: 'vo', voiceoverFrom: 10})).not.toMatch(/media/);
  });
});
