import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {detectMediaTools} from '../../scripts/media/inspect';
import {encodePng} from '../../scripts/media/png';

// The documented agent workflow end to end, in a throwaway copy of the repository: create a
// registered project, import owner-style media through the CLI, time the voiceover, wire a
// component that uses the assets by id, and pass typecheck and project validation. Synthetic media
// only; the real checkout is never written to.

const repo = path.resolve('.');
const tsx = path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tools = detectMediaTools();

describe.skipIf(!tools.ffmpeg || !tools.ffprobe)('agent media workflow in an isolated workspace', () => {
  let workspace = '';
  let assets = '';
  const cli = (script: string, args: string[]) => spawnSync(process.execPath, [tsx, path.join(workspace, 'scripts', script), ...args], {encoding: 'utf8', cwd: workspace});

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'abud-agent-workflow-'));
    for (const entry of ['src', 'scripts', 'projects', 'tsconfig.json', 'package.json']) cpSync(path.join(repo, entry), path.join(workspace, entry), {recursive: true});
    mkdirSync(path.join(workspace, 'public'), {recursive: true});
    symlinkSync(path.join(repo, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
    // "Owner" files in a separate folder, as the owner would hand them over.
    assets = path.join(workspace, 'owner-drop');
    mkdirSync(assets);
    writeFileSync(path.join(assets, 'App Home Screen.png'), encodePng(390, 844, (x, y) => [20 + (x % 40), 90, 160 + (y % 60), 255]));
    writeFileSync(path.join(assets, 'mascot.png'), encodePng(200, 400, (x, y) => ((x - 100) ** 2 / 90 ** 2 + (y - 200) ** 2 / 190 ** 2 <= 1 ? [230, 120, 40, 255] : [0, 0, 0, 0])));
    const ffmpeg = spawnSync(tools.ffmpeg!, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=240:duration=6', '-af', "volume='if(lt(mod(t,2),1.5),0.6,0)':eval=frame", path.join(assets, 'elevenlabs-voice.mp3')], {encoding: 'utf8'});
    expect(ffmpeg.status, ffmpeg.stderr).toBe(0);
    writeFileSync(path.join(assets, 'script.txt'), 'Open the app\nTap the big button\nDone in seconds\n', 'utf8');
  });

  afterAll(() => {
    if (!workspace) return;
    const link = path.join(workspace, 'node_modules');
    try {
      unlinkSync(link);
    } catch {
      rmdirSync(link);
    }
    const linkGone = (() => {
      try {
        lstatSync(link);
        return false;
      } catch {
        return true;
      }
    })();
    if (linkGone) rmSync(workspace, {recursive: true, force: true});
  });

  it('creates a project, imports and times media, uses it by id, and validates', () => {
    const created = cli('project-new.ts', ['--id', 'agent-reel', '--title', 'Agent reel', '--language', 'en', '--format', 'horizontal', '--duration', '10', '--style', 'whiteboard', '--root', workspace]);
    expect(created.status, created.stderr).toBe(0);

    // Unregistered projects cannot receive media.
    const stray = cli('asset.ts', ['import', '--project', 'nobody', '--file', path.join(assets, 'mascot.png')]);
    expect(stray.status).toBe(1);
    expect(stray.stderr).toMatch(/unknown-project/);

    const folder = cli('asset.ts', ['import', '--project', 'agent-reel', '--dir', assets]);
    expect(folder.status, folder.stdout + folder.stderr).toBe(0);
    expect(folder.stdout).toMatch(/4 imported or already present, 0 failed, 0 skipped/);
    const manifest = JSON.parse(readFileSync(path.join(workspace, 'public/user-assets/agent-reel/assets.json'), 'utf8')) as {assets: {id: string; role: string}[]};
    expect(Object.fromEntries(manifest.assets.map((asset) => [asset.id, asset.role]))).toEqual({
      'app-home-screen': 'screenshot',
      'elevenlabs-voice': 'voiceover',
      mascot: 'character',
      script: 'transcript',
    });

    const timed = cli('asset.ts', ['voiceover', '--project', 'agent-reel', '--aligner', 'none']);
    expect(timed.status, timed.stdout + timed.stderr).toBe(0);
    expect(timed.stdout).toMatch(/Method: estimated/);
    expect(timed.stdout).toMatch(/OK: The voiceover \(6\.\d+s\) fits the composition \(10\.00s\)/);
    expect(timed.stdout).toMatch(/Suggested scenes at 30 fps/);
    expect(existsSync(path.join(workspace, 'public/user-assets/agent-reel/timing/elevenlabs-voice.json'))).toBe(true);

    // The agent's edit: a component that uses the assets by id, and the ids in the project.
    const componentFile = path.join(workspace, 'src/projects/agent-reel/AgentReelComposition.tsx');
    const exportName = /export const (\w+)/.exec(readFileSync(componentFile, 'utf8'))![1];
    writeFileSync(
      componentFile,
      `import {AbsoluteFill} from 'remotion';
import {CharacterSprite, ProjectMediaProvider, ScreenshotFrame, VoiceoverCaptions, VoiceoverTrack} from '../../motion/media';

export const ${exportName} = () => (
  <ProjectMediaProvider projectId="agent-reel">
    <AbsoluteFill style={{background: '#f4f1ea'}}>
      <ScreenshotFrame asset="app-home-screen" device="phone" enter={{type: 'rise', frame: 0}} highlights={[{region: [0.1, 0.6, 0.8, 0.12], from: 45}]} />
      <CharacterSprite asset="mascot" height={420} x={300} y={960} idle={{bob: 6}} />
      <VoiceoverTrack asset="elevenlabs-voice" from={10} />
      <VoiceoverCaptions voiceover="elevenlabs-voice" from={10} fallbackDirection="ltr" />
    </AbsoluteFill>
  </ProjectMediaProvider>
);
`,
    );
    const projectFile = path.join(workspace, 'src/projects/agent-reel/project.ts');
    const project = readFileSync(projectFile, 'utf8');
    expect(project).toMatch(/\n  defaultProps:/);
    writeFileSync(projectFile, project.replace(/\n  defaultProps:/, "\n  media: {assets: ['app-home-screen', 'mascot', 'elevenlabs-voice'], voiceover: 'elevenlabs-voice'},\n  defaultProps:"));

    const typecheck = spawnSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', path.join(workspace, 'tsconfig.json')], {encoding: 'utf8'});
    expect(typecheck.status, typecheck.stdout).toBe(0);
    const validate = spawnSync(process.execPath, [tsx, 'scripts/validate-projects.ts'], {encoding: 'utf8', cwd: workspace});
    expect(validate.status, validate.stdout).toBe(0);
    expect(validate.stdout).toMatch(/agent-reel/);
    expect(validate.stdout).toMatch(/agent-reel\.media: voiceover timing is estimated/);
    const listed = cli('asset.ts', ['list', '--project', 'agent-reel', '--verify']);
    expect(listed.status, listed.stdout).toBe(0);
    expect(listed.stdout).toMatch(/timing: estimated/);

    // An asset the project needs but nobody imported is a validation error, not a silent gap.
    writeFileSync(projectFile, readFileSync(projectFile, 'utf8').replace("'mascot', ", "'mascot', 'logo', "));
    const missing = spawnSync(process.execPath, [tsx, 'scripts/validate-projects.ts'], {encoding: 'utf8', cwd: workspace});
    expect(missing.status).toBe(1);
    expect(missing.stdout).toMatch(/asset "logo" is not imported/);
  }, 180_000);
});
