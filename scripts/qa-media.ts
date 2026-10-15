// npm run qa:media [-- --fresh] [--aligner auto|mms|none]
//
// Generates synthetic test media (never owner media) in a temporary folder and imports it through
// the real importer into the QA fixture project "qa-media", then times the voiceover. Afterwards
// QA-Media-* compositions in Studio, the library, and the browser tests use real imported files.
// --fresh first removes public/user-assets/qa-media/ (generated fixture data only).
// Requires FFmpeg. The voiceover is real speech from Windows speech synthesis when available,
// otherwise tone bursts (then alignment is skipped and labelled).
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {MEDIA_FIXTURE_ASSETS as A, mediaFixtureMeta} from '../src/projects/fixtures/media';
import {projectRegistry} from '../src/projects/registry';
import {AssetError, FFMPEG_SETUP, detectMediaTools} from './media/inspect';
import {importAsset, loadManifest, publicPath} from './media/library';
import {encodePng} from './media/png';
import {alignVoiceover} from './media/voiceover';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRound = (x: number, y: number, x0: number, y0: number, w: number, h: number, r: number) => {
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
};
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

/** A simple synthetic figure on a transparent background; `armUp` makes a second pose. */
const figure = (armUp: boolean) =>
  encodePng(300, 600, (x, y) => {
    if (inEllipse(x, y, 150, 95, 70, 75)) return [244, 200, 160, 255];
    if (inRound(x, y, 85, 175, 130, 230, 40)) return [70, 130, 220, 255];
    if (armUp ? inRound(x, y, 215, 40, 34, 170, 17) : inRound(x, y, 215, 185, 34, 170, 17)) return [244, 200, 160, 255];
    if (inRound(x, y, 51, 185, 34, 170, 17)) return [244, 200, 160, 255];
    if (inRound(x, y, 95, 400, 44, 190, 20) || inRound(x, y, 161, 400, 44, 190, 20)) return [40, 44, 60, 255];
    return CLEAR;
  });

const ffmpeg = (tool: string, args: string[]) => {
  const result = spawnSync(tool, ['-v', 'error', '-y', '-nostdin', ...args], {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
};

const TRANSCRIPT = ['Import the voiceover first.', 'Screenshots keep their real content.', 'Characters move without distortion.'];

const speak = (file: string) => {
  if (process.platform !== 'win32') return false;
  const text = TRANSCRIPT.join(' ').replace(/'/g, "''");
  const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 0; $s.SetOutputToWaveFile('${file.replace(/'/g, "''")}'); $s.Speak('${text}'); $s.Dispose()`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {encoding: 'utf8', windowsHide: true});
  return result.status === 0;
};

const main = () => {
  const {values} = parseArgs({options: {fresh: {type: 'boolean', default: false}, aligner: {type: 'string', default: 'auto'}}});
  const tools = detectMediaTools();
  if (!tools.ffmpeg || !tools.ffprobe) throw new AssetError('missing-dependency', `qa:media needs FFmpeg. ${FFMPEG_SETUP}`);
  const projectId = mediaFixtureMeta.id;
  if (values.fresh) rmSync(publicPath(root, `user-assets/${projectId}`), {recursive: true, force: true});

  const work = mkdtempSync(path.join(os.tmpdir(), 'abud-qa-media-'));
  try {
    const file = (name: string) => path.join(work, name);
    // Screenshots: FFmpeg test patterns, clearly synthetic (never a fabricated product UI).
    ffmpeg(tools.ffmpeg, ['-f', 'lavfi', '-i', 'testsrc2=size=1600x1000:rate=1', '-frames:v', '1', file('screen-desktop.png')]);
    ffmpeg(tools.ffmpeg, ['-f', 'lavfi', '-i', 'testsrc=size=720x1560:rate=1', '-frames:v', '1', file('screen-phone.jpg')]);
    writeFileSync(file('hero-pose-a.png'), figure(false));
    writeFileSync(file('hero-pose-b.png'), figure(true));
    writeFileSync(file('rig-torso.png'), encodePng(200, 360, (x, y) => (inRound(x, y, 0, 0, 200, 360, 60) ? [70, 130, 220, 255] : CLEAR)));
    writeFileSync(file('rig-head.png'), encodePng(160, 180, (x, y) => (inEllipse(x, y, 80, 90, 78, 88) ? (inEllipse(x, y, 110, 75, 10, 12) ? [30, 30, 40, 255] : [244, 200, 160, 255]) : CLEAR)));
    writeFileSync(file('rig-arm.png'), encodePng(56, 220, (x, y) => (inRound(x, y, 0, 0, 56, 220, 28) ? [234, 186, 146, 255] : CLEAR)));
    const spoken = speak(file('voiceover.wav'));
    if (!spoken) {
      // Three tone bursts separated by pauses: speech-like regions for timing, no words.
      ffmpeg(tools.ffmpeg, ['-f', 'lavfi', '-i', 'sine=frequency=300:duration=7', '-af', "volume='if(lt(mod(t,2.3),1.7),0.6,0)':eval=frame", '-ar', '44100', file('voiceover.wav')]);
    }
    writeFileSync(file('transcript.txt'), `${TRANSCRIPT.join('\n')}\n`, 'utf8');
    // A tone "voice" (three bursts) with owner-supplied mixed Arabic/English word timing.
    ffmpeg(tools.ffmpeg, ['-f', 'lavfi', '-i', 'sine=frequency=260:duration=7', '-af', "volume='if(lt(mod(t,2.3),1.7),0.5,0)':eval=frame", '-ar', '44100', file('voiceover-mixed.wav')]);
    const timedLine = (text: string, start: number, end: number) => {
      const words = text.split(' ');
      const step = (end - start) / words.length;
      return {text, start, end, words: words.map((w, index) => ({w, start: +(start + index * step).toFixed(3), end: +(start + (index + 1) * step - 0.04).toFixed(3)}))};
    };
    const mixedLines = [
      timedLine('جرّب ABUD Motion Studio دلوقتي', 0.1, 1.6),
      timedLine('الصوت بيحدد التوقيت 100%', 2.4, 3.9),
      timedLine('الـ Captions بتفضل مقروءة', 4.7, 6.2),
    ];
    writeFileSync(file('mixed-timing.json'), JSON.stringify({duration: 7, lines: mixedLines}, null, 1), 'utf8');
    ffmpeg(tools.ffmpeg, ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=12', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-filter_complex', 'amix=inputs=2,volume=0.5', '-ac', '2', '-ar', '44100', file('music-bed.mp3')]);
    ffmpeg(tools.ffmpeg, ['-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.25', '-af', 'afade=t=out:st=0.05:d=0.2', file('sfx-pop.wav')]);

    const knownProjects = new Set(projectRegistry.map((entry) => entry.meta.id));
    const imports: [string, string, string][] = [
      ['screen-desktop.png', A.desktop, 'screenshot'],
      ['screen-phone.jpg', A.phone, 'screenshot'],
      ['hero-pose-a.png', A.poseA, 'character-pose'],
      ['hero-pose-b.png', A.poseB, 'character-pose'],
      ['rig-torso.png', A.torso, 'character-layer'],
      ['rig-head.png', A.head, 'character-layer'],
      ['rig-arm.png', A.arm, 'character-layer'],
      ['voiceover.wav', A.voiceover, 'voiceover'],
      ['transcript.txt', 'transcript', 'transcript'],
      ['voiceover-mixed.wav', A.voiceoverMixed, 'voiceover'],
      ['mixed-timing.json', 'mixed-timing', 'timing'],
      ['music-bed.mp3', A.music, 'music'],
      ['sfx-pop.wav', A.sfx, 'sfx'],
    ];
    for (const [name, id, role] of imports) {
      const existing = loadManifest(root, projectId).assets.find((asset) => asset.id === id);
      if (existing) {
        console.log(`present   ${id}`);
        continue;
      }
      const result = importAsset({root, projectId, file: file(name), id, role, license: 'Synthetic QA media generated by npm run qa:media', tools, knownProjects});
      console.log(`${result.status.padEnd(9)} ${result.asset.id}`);
    }
    const aligned = alignVoiceover({
      root,
      manifest: loadManifest(root, projectId),
      voiceoverId: A.voiceover,
      transcriptId: spoken ? 'transcript' : null,
      aligner: values.aligner as 'auto' | 'mms' | 'none',
      language: 'eng',
      tools,
    });
    const mixed = alignVoiceover({root, manifest: loadManifest(root, projectId), voiceoverId: A.voiceoverMixed, timingId: 'mixed-timing', aligner: 'none', language: 'ara', tools});
    console.log(`\nMixed Arabic/English caption track: timing ${mixed.timing.method}`);
    console.log(`Voiceover: ${spoken ? 'Windows speech synthesis' : 'tone bursts (no speech synthesis available)'}; timing ${aligned.timing.method}`);
    for (const line of aligned.timing.lines) console.log(`  ${line.start.toFixed(2)}–${line.end.toFixed(2)}  ${line.text}`);
    for (const note of aligned.notes) console.log(`! ${note}`);
    console.log(`\nReady: open QA-Media-Horizontal in Studio (npm run studio) or "${mediaFixtureMeta.title}" in the library.`);
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
};

try {
  main();
} catch (error) {
  console.error(error instanceof AssetError ? `qa:media [${error.code}]: ${error.message}` : error);
  process.exit(1);
}
