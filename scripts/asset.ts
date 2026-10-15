// Owner media for a project — import, discover, and time a voiceover. Never renders or exports.
//
//   npm run asset:import -- --project <id> --file "<path>" [--role voiceover] [--id my-id] [--license "..."]
//   npm run asset:import -- --project <id> --dir "<folder>" [--recursive]
//   npm run asset:list -- [--project <id>] [--verify] [--json]
//   npm run voiceover:align -- --project <id> [--voiceover <id>] [--transcript <id> | --script "<path>"]
//                              [--timing <id>] [--aligner auto|mms|none] [--lang ara|eng] [--allow-download]
//
// Files go to the git-ignored public/user-assets/<project>/ with a manifest (assets.json) that
// components and the library read. Sources are only read, never moved or changed.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {ASSET_ROLES, describeAsset} from '../src/motion/media/manifest';
import type {AssetRecord, AudioMetadata} from '../src/motion/media/manifest';
import {checkVoiceoverFit, planScenesFromVoiceover} from '../src/motion/media/timing';
import {projectRegistry} from '../src/projects/registry';
import {AssetError, FFMPEG_SETUP, detectMediaTools} from './media/inspect';
import {checkAssets, importAsset, importDirectory, loadManifest, projectsWithMedia} from './media/library';
import {alignVoiceover, alignerLanguage} from './media/voiceover';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const knownProjects = new Set(projectRegistry.map((entry) => entry.meta.id));
const projectMeta = (id: string) => projectRegistry.find((entry) => entry.meta.id === id)?.meta;

const usageHint = (asset: AssetRecord) => {
  switch (asset.role) {
    case 'voiceover':
      return asset.timing ? `<VoiceoverTrack asset="${asset.id}" /> + <VoiceoverCaptions voiceover="${asset.id}" />` : `<VoiceoverTrack asset="${asset.id}" />; run npm run voiceover:align for timing`;
    case 'music':
      return `<MusicBed asset="${asset.id}" duckUnder="<voiceover id>" />`;
    case 'sfx':
      return `<SoundCue asset="${asset.id}" at={frame} />`;
    case 'screenshot':
      return `<ScreenshotFrame asset="${asset.id}" device="${(asset.metadata as {orientation?: string}).orientation === 'portrait' ? 'phone' : 'browser'}" />`;
    case 'character':
    case 'character-pose':
      return `<CharacterSprite asset="${asset.id}" />`;
    case 'character-layer':
      return `<LayeredCharacter layers={[{asset: "${asset.id}", ...}]} />`;
    case 'transcript':
      return `npm run voiceover:align -- --transcript ${asset.id}`;
    default:
      return asset.kind === 'image' ? `<AssetImage asset="${asset.id}" />` : `staticFile('${asset.file}')`;
  }
};

const printAsset = (asset: AssetRecord) => {
  console.log(`  ${asset.id.padEnd(26)} ${asset.role.padEnd(16)} ${describeAsset(asset)}${asset.browserPreview ? '' : ' · NOT previewable in the browser'}`);
};

const runImport = (args: string[]) => {
  const {values} = parseArgs({
    args,
    options: {
      project: {type: 'string'}, file: {type: 'string'}, dir: {type: 'string'}, recursive: {type: 'boolean', default: false},
      role: {type: 'string'}, id: {type: 'string'}, license: {type: 'string'}, notes: {type: 'string'},
    },
  });
  if (!values.project || (!values.file && !values.dir) || (values.file && values.dir)) {
    throw new AssetError('missing-file', `Usage: npm run asset:import -- --project <id> (--file "<path>" | --dir "<folder>") [--role ${Object.keys(ASSET_ROLES).join('|')}] [--id <asset-id>] [--license "..."]`);
  }
  const tools = detectMediaTools();
  if (!tools.ffprobe || !tools.ffmpeg) console.warn(`Note: FFmpeg was not found — audio and video cannot be imported and images are only header-checked. ${FFMPEG_SETUP}\n`);
  const shared = {root, projectId: values.project, role: values.role, license: values.license, notes: values.notes, tools, knownProjects};
  if (values.dir) {
    if (values.id) throw new AssetError('invalid-id', '--id applies to a single --file, not a folder.');
    const result = importDirectory({...shared, dir: values.dir, recursive: values.recursive});
    for (const item of result.imported) {
      console.log(`${item.status === 'imported' ? 'imported' : item.status}  ${item.asset.id}`);
      for (const warning of item.warnings) console.log(`  ! ${warning}`);
    }
    for (const failure of result.failed) console.log(`FAILED    ${path.basename(failure.file)} [${failure.code}] ${failure.message}`);
    for (const skipped of result.skipped) console.log(`skipped   ${path.basename(skipped)} (unsupported type)`);
    console.log(`\n${result.imported.length} imported or already present, ${result.failed.length} failed, ${result.skipped.length} skipped.`);
    console.log(`See everything with: npm run asset:list -- --project ${values.project}`);
    if (result.failed.length > 0) process.exitCode = 1;
    return;
  }
  const result = importAsset({...shared, file: values.file!, id: values.id});
  const {asset} = result;
  console.log(result.status === 'imported' ? `Imported "${asset.id}" into ${values.project}` : `No copy made (${result.status}).`);
  printAsset(asset);
  for (const warning of result.warnings) console.log(`  ! ${warning}`);
  console.log(`  file:    public/${asset.file}  (original untouched: ${asset.sourcePath})`);
  console.log(`  use:     ${usageHint(asset)}`);
  if (asset.role === 'voiceover') console.log(`  next:    npm run voiceover:align -- --project ${values.project} --voiceover ${asset.id} [--script "<transcript.txt>"]`);
};

const runList = (args: string[]) => {
  const {values} = parseArgs({args, options: {project: {type: 'string'}, verify: {type: 'boolean', default: false}, json: {type: 'boolean', default: false}}});
  const ids = values.project ? [values.project] : projectsWithMedia(root);
  const report = ids.map((id) => {
    const manifest = loadManifest(root, id);
    return {projectId: id, registered: knownProjects.has(id), required: projectMeta(id)?.media?.assets ?? [], checks: checkAssets(root, manifest, {hash: values.verify})};
  });
  if (values.json) {
    const json = report.map(({checks, ...item}) => ({...item, assets: checks.map(({asset, ...state}) => ({...asset, ...state}))}));
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  if (report.length === 0) console.log('No project has imported media yet. Import with npm run asset:import -- --project <id> --file "<path>".');
  let problems = 0;
  for (const item of report) {
    console.log(`${item.projectId}${item.registered ? '' : '  (NOT a registered project)'} — ${item.checks.length} asset(s) in public/user-assets/${item.projectId}/`);
    for (const check of item.checks) {
      printAsset(check.asset);
      const flags = [
        !check.present && 'FILE MISSING',
        check.intact === false && 'CONTENT CHANGED since import',
        check.timingPresent === false && 'timing file missing',
        check.asset.timing && `timing: ${check.asset.timing.method}${check.asset.timing.lowConfidenceWords ? `, ${check.asset.timing.lowConfidenceWords} low-confidence words` : ''}`,
      ].filter(Boolean);
      if (flags.length) console.log(`  ${''.padEnd(26)} ${flags.join(' · ')}`);
      if (!check.present || check.intact === false || check.timingPresent === false) problems += 1;
    }
    const missing = item.required.filter((id) => !item.checks.some((check) => check.asset.id === id));
    if (missing.length) {
      console.log(`  The project needs asset(s) that are not imported: ${missing.join(', ')}`);
      problems += missing.length;
    }
  }
  if (problems > 0) process.exitCode = 1;
};

const runVoiceover = async (args: string[]) => {
  const {values} = parseArgs({
    args,
    options: {
      project: {type: 'string'}, voiceover: {type: 'string'}, transcript: {type: 'string'}, script: {type: 'string'}, timing: {type: 'string'},
      aligner: {type: 'string', default: 'auto'}, lang: {type: 'string'}, 'allow-download': {type: 'boolean', default: false},
    },
  });
  if (!values.project) throw new AssetError('missing-file', 'Usage: npm run voiceover:align -- --project <id> [--voiceover <id>] [--transcript <id> | --script "<path>"] [--aligner auto|mms|none]');
  if (!['auto', 'mms', 'none'].includes(values.aligner!)) throw new AssetError('invalid-role', '--aligner must be auto, mms, or none');
  const meta = projectMeta(values.project);
  if (!meta) throw new AssetError('unknown-project', `No registered project "${values.project}".`);
  const tools = detectMediaTools();
  let transcriptId = values.transcript;
  if (values.script) {
    // A transcript given as a file is imported first, so it is kept with the project like any asset.
    const imported = importAsset({root, projectId: meta.id, file: values.script, role: 'transcript', tools, knownProjects});
    transcriptId = imported.asset.id;
    console.log(`Transcript ${imported.status === 'imported' ? 'imported' : 'already present'} as "${transcriptId}".`);
  }
  const language = values.lang ?? alignerLanguage(meta.language);
  console.log(`Timing the voiceover for ${meta.id} (aligner: ${values.aligner}, language: ${language}) …`);
  const result = alignVoiceover({
    root, manifest: loadManifest(root, meta.id), voiceoverId: values.voiceover, transcriptId, timingId: values.timing,
    aligner: values.aligner as 'auto' | 'mms' | 'none', language, allowDownload: values['allow-download'], tools,
  });
  const {timing} = result;
  console.log(`\nMethod: ${timing.method} — ${timing.source}`);
  console.log(`Voiceover: ${timing.voiceover} (${timing.duration.toFixed(2)}s, ${timing.speech?.length ?? 0} speech regions)`);
  for (const line of timing.lines) console.log(`  ${line.start.toFixed(2).padStart(6)}–${line.end.toFixed(2).padEnd(6)} ${line.text.slice(0, 80)}`);
  for (const note of result.notes) console.log(`! ${note}`);
  console.log(`Wrote public/${result.file}`);

  const fit = checkVoiceoverFit(timing.duration, meta.durationInFrames, meta.fps, {leadInFrames: meta.media?.voiceoverFrom ?? 0});
  console.log(`\n${fit.ok ? 'OK' : 'MISMATCH'}: ${fit.message}`);
  if (!fit.ok) for (const suggestion of fit.suggestions) console.log(`  - ${suggestion}`);
  const plan = planScenesFromVoiceover(timing, {fps: meta.fps});
  console.log(`\nSuggested scenes at ${meta.fps} fps (cuts in natural pauses, total ${plan.totalFrames} frames):`);
  for (const scene of plan.scenes) console.log(`  {id: '${scene.id}', title: '${scene.text.slice(0, 40).replace(/'/g, "\\'") || scene.id}', durationInFrames: ${scene.durationInFrames}},  // speech from frame ${scene.speechFrom}`);
  const audio = loadManifest(root, meta.id).assets.find((asset) => asset.id === timing.voiceover)?.metadata as AudioMetadata | undefined;
  if (audio) console.log(`\nThe recording was not changed (${audio.codec}, ${audio.sampleRate} Hz).`);
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'import') return runImport(args);
  if (command === 'list') return runList(args);
  if (command === 'voiceover') return runVoiceover(args);
  throw new AssetError('missing-file', 'Commands: import, list, voiceover (use the npm scripts asset:import, asset:list, voiceover:align).');
};

main().catch((error: unknown) => {
  if (error instanceof AssetError) console.error(`asset [${error.code}]: ${error.message}`);
  else console.error(error);
  process.exit(1);
});
