// Validates every registered project against the contract and checks that production docs exist.
// Read-only: it never renders, exports, or writes files.
import {existsSync} from 'node:fs';
import path from 'node:path';
import {validateRegistry} from '../src/projects/contract';
import type {ProjectIssue} from '../src/projects/contract';
import {projectRegistry} from '../src/projects/registry';
import type {AudioMetadata} from '../src/motion/media/manifest';
import {checkVoiceoverFit} from '../src/motion/media/timing';
import {AssetError} from './media/inspect';
import {checkAssets, loadManifest} from './media/library';

const REQUIRED_DOCS = ['SCRIPT.md', 'STYLE.md', 'SCENES.md'];

const issues: ProjectIssue[] = validateRegistry(projectRegistry.map((entry) => entry.meta));
for (const {meta} of projectRegistry) {
  if (!meta.docsPath) continue;
  for (const file of REQUIRED_DOCS) {
    if (!existsSync(path.resolve(meta.docsPath, file))) {
      issues.push({severity: 'error', path: `${meta.id}.docsPath`, message: `missing ${meta.docsPath}/${file}`});
    }
  }
  for (const asset of meta.assets) {
    if (!existsSync(path.resolve('public', asset.path))) {
      issues.push({severity: 'error', path: `${meta.id}.assets`, message: `missing public/${asset.path}`});
    }
  }
}

// Owner media lives only on the owner's machine (git-ignored). Absent media is a warning (a fresh
// clone has none); media that is present but incomplete, broken, or too long for the composition
// is an error, because the preview would be wrong.
for (const {meta} of projectRegistry) {
  if (!meta.media) continue;
  const where = `public/user-assets/${meta.id}/assets.json`;
  if (!existsSync(path.resolve(where))) {
    issues.push({severity: 'warning', path: `${meta.id}.media`, message: `media not imported on this machine (${where} missing)${meta.id === 'qa-media' ? '; run npm run qa:media' : ''}`});
    continue;
  }
  try {
    const manifest = loadManifest(process.cwd(), meta.id);
    const checks = checkAssets(process.cwd(), manifest);
    for (const id of meta.media.assets) {
      const check = checks.find((item) => item.asset.id === id);
      if (!check) issues.push({severity: 'error', path: `${meta.id}.media`, message: `asset "${id}" is not imported`});
      else if (!check.present) issues.push({severity: 'error', path: `${meta.id}.media`, message: `asset "${id}" file is missing (public/${check.asset.file})`});
      else if (check.timingPresent === false) issues.push({severity: 'error', path: `${meta.id}.media`, message: `timing for "${id}" is missing; run npm run voiceover:align`});
    }
    const voiceover = meta.media.voiceover ? manifest.assets.find((asset) => asset.id === meta.media!.voiceover) : undefined;
    if (voiceover) {
      const fit = checkVoiceoverFit((voiceover.metadata as AudioMetadata).durationSeconds, meta.durationInFrames, meta.fps, {leadInFrames: meta.media.voiceoverFrom ?? 0});
      if (!fit.ok) issues.push({severity: fit.problem === 'cut-off' ? 'error' : 'warning', path: `${meta.id}.durationInFrames`, message: `${fit.message} ${fit.suggestions.join(' ')}`});
      if (!voiceover.timing) issues.push({severity: 'warning', path: `${meta.id}.media`, message: 'the voiceover has no timing yet; run npm run voiceover:align'});
      else if (voiceover.timing.method === 'estimated') issues.push({severity: 'warning', path: `${meta.id}.media`, message: 'voiceover timing is estimated, not aligned; captions show whole lines only'});
    }
  } catch (error) {
    if (!(error instanceof AssetError)) throw error;
    issues.push({severity: 'error', path: `${meta.id}.media`, message: error.message});
  }
}

for (const {meta} of projectRegistry) {
  console.log(`${meta.kind.padEnd(10)} ${meta.id.padEnd(24)} ${meta.status.stage.padEnd(14)} ${meta.compositions.map((item) => item.id).join(', ')}`);
}
for (const issue of issues) console.log(`${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`);

const errors = issues.filter((issue) => issue.severity === 'error').length;
console.log(`${projectRegistry.length} projects, ${errors} errors, ${issues.length - errors} warnings`);
process.exit(errors > 0 ? 1 : 0);
