import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {evaluateExportRequest} from '../src/export-policy';

const compositionId = process.argv[2];

if (!compositionId) {
  console.error('Usage: npm run export -- <composition-id>');
  process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Export refused: an interactive terminal is required. Automated and piped execution is not allowed.');
  process.exit(2);
}

console.log('\nMotionKit owner export');
console.log(`Composition: ${compositionId}`);
console.log('Watch the complete composition in Remotion Studio before continuing.');
console.log(`To confirm, type exactly: EXPORT ${compositionId}\n`);

const prompt = createInterface({input: process.stdin, output: process.stdout});
const confirmation = await prompt.question('Confirmation: ');
prompt.close();

const decision = evaluateExportRequest({
  stdinIsTTY: Boolean(process.stdin.isTTY),
  stdoutIsTTY: Boolean(process.stdout.isTTY),
  confirmation,
  compositionId,
});

if (!decision.allowed) {
  console.error('Export cancelled: confirmation did not match.');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(path.resolve('exports'), {recursive: true});
const output = path.resolve('exports', `${stamp}-${compositionId}.mp4`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  ['remotion', 'render', 'src/remotion.ts', compositionId, output],
  {stdio: 'inherit', shell: false},
);
process.exit(result.status ?? 1);
