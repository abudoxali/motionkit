import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {referenceSlug} from '../src/reference-import';

const sourceArg = process.argv[2];
const nameIndex = process.argv.indexOf('--name');
const suppliedName = nameIndex >= 0 ? process.argv[nameIndex + 1] : undefined;

if (!sourceArg) {
  console.error('Usage: npm run reference:import -- <video-path> --name "my-style"');
  process.exit(1);
}

const source = path.resolve(sourceArg);
const extension = path.extname(source).toLowerCase();
if (!['.mp4', '.mov', '.webm', '.mkv'].includes(extension)) {
  console.error('Reference must be an MP4, MOV, WebM, or MKV video.');
  process.exit(1);
}

const slug = referenceSlug(suppliedName ?? path.basename(source, extension));
const destinationDir = path.resolve('reference', 'user', slug);
const destination = path.join(destinationDir, `reference${extension}`);
await mkdir(destinationDir, {recursive: true});
await copyFile(source, destination);
await writeFile(
  path.join(destinationDir, 'SOURCE.md'),
  `# ${slug}\n\nImported from a user-supplied local file. The owner is responsible for usage and redistribution rights.\n`,
  'utf8',
);
console.log(`Imported reference: ${destination}`);
console.log(`Analyze it with:\n  npm run reference:analyze -- "${destination}" --out "analysis/${slug}"`);
