import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

// Media browser tests need the synthetic QA media in the git-ignored public/user-assets/qa-media/.
// Generate it (npm run qa:media) when it is missing or incomplete; that needs FFmpeg, and without
// it the media tests skip with a clear reason instead of failing on absent files.
const MANIFEST = path.resolve('public/user-assets/qa-media/assets.json');
const REQUIRED = ['screen-desktop', 'screen-phone', 'hero-pose-a', 'hero-pose-b', 'rig-torso', 'rig-head', 'rig-arm', 'voiceover', 'voiceover-mixed', 'music-bed', 'sfx-pop'];

const complete = () => {
  if (!existsSync(MANIFEST)) return false;
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {assets: {id: string; timing?: unknown}[]};
  return REQUIRED.every((id) => manifest.assets.some((asset) => asset.id === id)) && manifest.assets.filter((asset) => asset.timing).length >= 2;
};

export default function globalSetup() {
  if (complete()) return;
  if (spawnSync('ffmpeg', ['-version'], {encoding: 'utf8'}).status !== 0) {
    console.warn('[e2e] FFmpeg not found: media browser tests will be skipped (README, "Dependencies").');
    return;
  }
  console.log('[e2e] Generating synthetic QA media (npm run qa:media) ...');
  const result = spawnSync('npx tsx scripts/qa-media.ts --fresh', {stdio: 'inherit', shell: true});
  if (result.status !== 0) throw new Error('npm run qa:media failed; see the output above.');
}
