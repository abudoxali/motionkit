// Typography QA: renders one diagnostic still per typography fixture composition and fails if a
// fixture's in-browser audit reports overflow, safe-area violations, unloaded fonts, or glyph
// fallback. Stills only — this script never renders video.
import {bundle} from '@remotion/bundler';
import {getCompositions, renderStill} from '@remotion/renderer';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('analysis', 'qa', 'typography');
await mkdir(outputDirectory, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/remotion.ts')});
const report = [];
let failed = false;

try {
  const compositions = (await getCompositions(serveUrl)).filter((item) => item.id.startsWith('QA-Typography-'));
  if (compositions.length === 0) throw new Error('No QA-Typography-* compositions are registered.');

  for (const composition of compositions) {
    const output = path.join(outputDirectory, `${composition.id}.png`);
    const logs = [];
    const entry = {id: composition.id, size: `${composition.width}x${composition.height}`, output, issues: null, error: null};
    try {
      await renderStill({
        serveUrl,
        composition,
        frame: composition.durationInFrames - 1,
        output,
        scale: 0.5,
        onBrowserLog: (log) => logs.push(log.text),
      });
    } catch (error) {
      entry.error = error instanceof Error ? error.message.split('\n')[0] : String(error);
      failed = true;
    }
    const audit = logs.find((line) => line.includes('[typography-qa]'));
    if (audit) entry.issues = JSON.parse(audit.slice(audit.indexOf('{'))).issues;
    if (!audit && !entry.error) {
      entry.error = 'Fixture did not report an audit.';
      failed = true;
    }
    if (entry.issues?.length) failed = true;
    report.push(entry);
    console.log(`${entry.error || entry.issues?.length ? 'FAIL' : 'PASS'} ${composition.id} ${entry.size}${entry.error ? ` — ${entry.error}` : ''}`);
  }
} finally {
  await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await rm(serveUrl, {recursive: true, force: true});
}

console.log(`Report: ${path.join(outputDirectory, 'report.json')}`);
process.exit(failed ? 1 : 0);
