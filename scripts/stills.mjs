// Diagnostic still frames are allowed for visual QA. This script never renders video.
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';

const compositionId = process.argv[2] ?? 'Showcase-Horizontal';
const seconds = process.argv.slice(3).map(Number).filter(Number.isFinite);
if (seconds.length === 0) {
  console.error('Usage: npm run stills -- <composition-id> <seconds> [seconds...]');
  process.exit(1);
}

const outputDirectory = path.resolve('analysis', 'stills', compositionId);
await mkdir(outputDirectory, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/remotion.ts')});
const composition = await selectComposition({serveUrl, id: compositionId});

for (const second of seconds) {
  const frame = Math.min(
    composition.durationInFrames - 1,
    Math.max(0, Math.round(second * composition.fps)),
  );
  const output = path.join(outputDirectory, `t${second.toFixed(2).padStart(6, '0')}.png`);
  await renderStill({serveUrl, composition, frame, output, scale: 0.5});
  console.log(output);
}

await rm(serveUrl, {recursive: true, force: true});
