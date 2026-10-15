#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const artifactsDir = path.join(root, 'release-artifacts');
const isWin = process.platform === 'win32';

const git = (args) => {
  const res = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) {
    throw new Error('Git ' + args[0] + ' failed: ' + (res.stderr || res.error?.message || 'unknown error'));
  }
  return res.stdout.trim();
};

const run = (cmd, args, cwd) => {
  const isNpm = cmd === 'npm' || cmd === 'npx';
  const execCmd = isWin && isNpm ? 'cmd.exe' : cmd;
  const execArgs = isWin && isNpm ? ['/d', '/s', '/c', `${cmd} ${args.join(' ')}`] : args;
  const res = spawnSync(execCmd, execArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) {
    throw new Error(`Command "${cmd} ${args.join(' ')}" failed in ${cwd}:\n${res.stderr || res.stdout || res.error?.message}`);
  }
  return (res.stdout || '').trim();
};

const args = process.argv.slice(2);
const profileAll = args.includes('--profile=all') || args.includes('--internal');

try {
  // 1. Guard against dirty tracked worktree
  if (git(['status', '--porcelain', '--untracked-files=no'])) {
    throw new Error('Tracked files are modified. Commit and verify before release packaging.');
  }

  // 2. Guard against committed unsafe paths or media binaries
  const trackedFiles = git(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean);
  const unsafe = trackedFiles.filter((f) =>
    /^(out|exports|analysis|reference\/user|public\/user-assets|release-artifacts)\//i.test(f) ||
    ((/(^|\/)\.env(\.|$)/i.test(f)) && !f.endsWith('.env.example')) ||
    f === '.claude/launch.json' ||
    /\.(mp3|wav|m4a|mp4|mov|webm|pem|p12|pfx|key)$/i.test(f)
  );
  if (unsafe.length) throw new Error('Unsafe tracked paths detected in Git:\n' + unsafe.join('\n'));

  // 3. Create staging directory from HEAD
  const tempId = `mk-stage-${Date.now()}`;
  const stageDir = path.join(os.tmpdir(), tempId);
  mkdirSync(stageDir, {recursive: true});

  // Extract HEAD into stageDir using git archive and tar
  const tarArchive = path.join(stageDir, 'head.tar');
  git(['archive', '--format=tar', '--output=' + tarArchive, 'HEAD']);
  run('tar', ['-xf', tarArchive, '-C', stageDir], root);
  rmSync(tarArchive, {force: true});

  // 4. Separation: For public developer distribution, exclude owner-specific productions
  if (!profileAll) {
    const ownerPaths = [
      path.join(stageDir, 'projects', 'mohamy-showcase-oct2026'),
      path.join(stageDir, 'src', 'projects', 'mohamy-showcase-oct2026'),
      path.join(stageDir, 'src', 'tests', 'mohamy-showcase.test.ts'),
    ];
    for (const p of ownerPaths) {
      if (existsSync(p)) {
        rmSync(p, {recursive: true, force: true});
      }
    }

    // Sanitize src/projects/registry.ts in stageDir
    const registryPath = path.join(stageDir, 'src', 'projects', 'registry.ts');
    if (existsSync(registryPath)) {
      let regContent = readFileSync(registryPath, 'utf8');
      regContent = regContent.replace(
        /import\s+\{mohamyShowcaseOct2026Meta\}\s+from\s+['"]\.\/mohamy-showcase-oct2026\/project['"];?\r?\n?/g,
        ''
      );
      regContent = regContent.replace(
        /\s*register\(mohamyShowcaseOct2026Meta,\s*\(\)\s*=>\s*import\(['"]\.\/mohamy-showcase-oct2026\/MohamyShowcaseOct2026Composition['"]\)\.then\(\(module\)\s*=>\s*\(\{default:\s*module\.MohamyShowcaseOct2026Composition\}\)\)\),?\r?\n?/g,
        '\n'
      );
      writeFileSync(registryPath, regContent, 'utf8');
    }

    // Replace STATUS.md with public-safe release status
    const statusPath = path.join(stageDir, 'STATUS.md');
    if (existsSync(statusPath)) {
      writeFileSync(statusPath, [
        '# MotionKit status',
        '',
        '## Release v' + pkg.version,
        '',
        '**State:** Release candidate. Not yet publicly released.',
        '',
        '### Included',
        '',
        '- Motion engine: easing, springs, scene timeline, camera, responsive canvas layout, transitions.',
        '- 12 fitted presets with sanitised props, canvas-relative typography, and title-safe placement.',
        '- 4 visual styles (Plotter, Doodle, Whiteboard, Chalkboard) with title, explainer, and end-card scene templates.',
        '- Arabic and mixed-script typography: bundled Cairo and IBM Plex Sans Arabic fonts, bidi isolation, measured text fitting.',
        '- Owner-media workflow: asset importer, voiceover timing (forced alignment or estimates), screenshot/character/audio/caption components.',
        '- Typed project contract and registry with `npm run project:new` scaffolder.',
        '- Focus Doodle: Egyptian Arabic demonstration composition (compatibility fixture).',
        '- Local Vite library UI with style, preset, project, and format browsing.',
        '- Agent skills for Claude Code, Codex, and Antigravity.',
        '- Manual-only video export policy (interactive owner confirmation required).',
        '',
        '### Verification',
        '',
        '- `npm run validate`: Vitest tests, TypeScript type checking, Vite production build.',
        '- `npm run test:e2e`: Playwright browser tests (library, typography, presets, styles, media).',
        '- `npm run qa:typography`: Remotion diagnostic stills for all typography fixtures.',
        '- `npm run release:verify`: Standalone clean-checkout verification from the distribution ZIP.',
        '',
        '### Distribution notes',
        '',
        'This source package was generated by `npm run release:package`. Private owner productions',
        'and personal media are excluded. The complete development history is maintained in the',
        'private development repository.',
        '',
      ].join('\n'), 'utf8');
    }
  }

  // 5. Package clean staging directory into release ZIP
  mkdirSync(artifactsDir, {recursive: true});
  const filename = 'motionkit-v' + pkg.version + '-source.zip';
  const archivePath = path.join(artifactsDir, filename);
  rmSync(archivePath, {force: true});

  // Create zip using tar -a -c -f
  run('tar', ['-a', '-c', '-f', archivePath, '.'], stageDir);
  if (!existsSync(archivePath)) throw new Error('Release archive output is missing: ' + archivePath);

  // 6. Compute SHA-256 and generate SHA256SUMS.txt
  const hash = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  writeFileSync(path.join(artifactsDir, 'SHA256SUMS.txt'), `${hash}  ${filename}\n`, 'utf8');

  // 7. Verify package integrity via clean smoke extraction
  const verifyDir = path.join(os.tmpdir(), `mk-verify-${Date.now()}`);
  mkdirSync(verifyDir, {recursive: true});
  try {
    run('tar', ['-xf', archivePath, '-C', verifyDir], root);

    // Verify absence of excluded paths
    if (!profileAll) {
      const forbiddenInRelease = [
        path.join(verifyDir, 'projects', 'mohamy-showcase-oct2026'),
        path.join(verifyDir, 'src', 'projects', 'mohamy-showcase-oct2026'),
        path.join(verifyDir, 'src', 'tests', 'mohamy-showcase.test.ts'),
      ];
      for (const forbidden of forbiddenInRelease) {
        if (existsSync(forbidden)) {
          throw new Error(`Excluded path "${path.relative(verifyDir, forbidden)}" was found in the release archive!`);
        }
      }
    }

    // Link node_modules from root into verifyDir for fast smoke verification
    const verifyNodeModules = path.join(verifyDir, 'node_modules');
    const rootNodeModules = path.join(root, 'node_modules');
    if (existsSync(rootNodeModules)) {
      symlinkSync(rootNodeModules, verifyNodeModules, 'junction');
    }

    // Smoke check 1: doctor
    run('node', ['scripts/doctor.mjs'], verifyDir);

    // Smoke check 2: typecheck
    run('npx', ['tsc', '--noEmit'], verifyDir);

    // Smoke check 3: validate projects
    run('npx', ['tsx', 'scripts/validate-projects.ts'], verifyDir);

    // Smoke check 4: build visual library
    run('npx', ['vite', 'build'], verifyDir);

    console.log('✓ Release package verification passed (doctor, typecheck, projects:validate, build).');
  } finally {
    // Clean up verifyDir
    try {
      const verifyNodeModules = path.join(verifyDir, 'node_modules');
      if (existsSync(verifyNodeModules)) {
        rmSync(verifyNodeModules, {force: true});
      }
      rmSync(verifyDir, {recursive: true, force: true});
    } catch {
      // Ignore cleanup error on tmp directory
    }
  }

  // Clean up staging directory
  rmSync(stageDir, {recursive: true, force: true});

  console.log(`
┌────────────────────────────────────────────────────────┐
│  MotionKit — Distribution Package Ready                │
└────────────────────────────────────────────────────────┘
`);
  console.log('Profile:       ' + (profileAll ? 'All (Internal Workspace)' : 'Clean Developer Distribution (Public-Safe)'));
  console.log('Archive:       ' + archivePath);
  console.log('Filename:      ' + filename);
  console.log('SHA-256:       ' + hash);
  console.log('Source commit: ' + git(['rev-parse', '--short', 'HEAD']));
  console.log('Status:        Packaged & Verified. Untracked owner media and personal productions excluded.');
  console.log('Distribution:  Ready for owner review. Do not publish publicly without explicit owner authorization.');
} catch (err) {
  console.error('[release:package failed]: ' + err.message);
  process.exitCode = 1;
}
