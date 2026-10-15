#!/usr/bin/env node
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const zipPath = path.join(root, 'release-artifacts', `motionkit-v${pkg.version}-source.zip`);
const isWin = process.platform === 'win32';

if (!existsSync(zipPath)) {
  console.error(`Release zip not found: ${zipPath}. Run npm run release:package first.`);
  process.exit(1);
}

const run = (cmd, args, cwd, env = {}) => {
  const isNpm = cmd === 'npm' || cmd === 'npx';
  const execCmd = isWin && isNpm ? 'cmd.exe' : cmd;
  const execArgs = isWin && isNpm ? ['/d', '/s', '/c', `${cmd} ${args.join(' ')}`] : args;
  console.log(`[clean-verify] Running: ${cmd} ${args.join(' ')} in ${cwd}`);
  const res = spawnSync(execCmd, execArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: {...process.env, ...env},
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) {
    throw new Error(`Command "${cmd} ${args.join(' ')}" failed with status ${res.status}:\n${res.stderr || res.stdout || res.error?.message}`);
  }
  return (res.stdout || '').trim();
};

const waitForHttp = (url, timeoutMs = 20000) => {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(res.statusCode);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for HTTP service at ${url}`));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
};

const cleanDir = path.join(os.tmpdir(), `mk-standalone-test-${Date.now()}`);
console.log(`\n======================================================`);
console.log(`  MotionKit Clean Standalone Distribution Verification`);
console.log(`======================================================`);
console.log(`Extracting: ${zipPath}`);
console.log(`Target dir: ${cleanDir}\n`);

mkdirSync(cleanDir, {recursive: true});

try {
  // 1. Extract ZIP
  run('tar', ['-xf', zipPath, '-C', cleanDir], root);
  console.log('✓ Successfully extracted release ZIP.');

  // Verify that owner-only files are NOT in the clean checkout
  const forbidden = [
    'projects/mohamy-showcase-oct2026',
    'src/projects/mohamy-showcase-oct2026',
    'src/tests/mohamy-showcase.test.ts',
    '.claude/launch.json',
  ];
  for (const f of forbidden) {
    if (existsSync(path.join(cleanDir, f))) {
      throw new Error(`Forbidden file/path found in clean release checkout: ${f}`);
    }
  }
  console.log('✓ Verified absence of owner-only paths and client productions.');

  // Verify STATUS.md does not contain internal development history
  const statusInClean = path.join(cleanDir, 'STATUS.md');
  if (existsSync(statusInClean)) {
    const statusContent = readFileSync(statusInClean, 'utf8');
    const internalMarkers = ['mohamy-showcase', 'ElevenLabs', 'MohamyPhone', 'Fatima –', 'code-review skill'];
    for (const marker of internalMarkers) {
      if (statusContent.includes(marker)) {
        throw new Error(`STATUS.md in the release archive contains internal content marker: "${marker}". The packaging script should replace it with a public-safe version.`);
      }
    }
    console.log('✓ STATUS.md is public-safe (no internal development history markers).');
  }

  // 2. Fresh npm ci without linking
  console.log('\n[clean-verify] Running fresh npm ci (no linking)...');
  run('npm', ['ci'], cleanDir);
  console.log('✓ Fresh npm ci completed successfully.');

  // 3. Doctor
  console.log('\n[clean-verify] Running doctor check...');
  const doctorOut = run('node', ['scripts/doctor.mjs'], cleanDir);
  console.log(doctorOut);
  console.log('✓ Doctor check passed.');

  // 4. Typecheck
  console.log('\n[clean-verify] Running typecheck (tsc --noEmit)...');
  run('npx', ['tsc', '--noEmit'], cleanDir);
  console.log('✓ TypeScript check passed cleanly.');

  // 5. Projects validate
  console.log('\n[clean-verify] Running projects:validate...');
  const projOut = run('npx', ['tsx', 'scripts/validate-projects.ts'], cleanDir);
  console.log(projOut);
  console.log('✓ Projects validation passed.');

  // 6. Build
  console.log('\n[clean-verify] Running vite build...');
  run('npx', ['vite', 'build'], cleanDir);
  console.log('✓ Vite build passed cleanly.');

  // 7. Vitest run
  console.log('\n[clean-verify] Running test suite (vitest run)...');
  const testOut = run('npx', ['vitest', 'run'], cleanDir);
  console.log(testOut.split('\n').slice(-5).join('\n'));
  console.log('✓ Test suite passed in standalone checkout.');

  // 8. Project scaffolding test
  console.log('\n[clean-verify] Testing project:new scaffolder in clean distribution...');
  run('npx', ['tsx', 'scripts/project-new.ts', '--id', 'clean-demo-proj', '--title=CleanDemo', '--language', 'ar', '--duration', '8'], cleanDir);
  console.log('✓ Project scaffolding created clean-demo-proj.');

  // Validate registry and compile after scaffolding
  run('npx', ['tsx', 'scripts/validate-projects.ts'], cleanDir);
  run('npx', ['tsc', '--noEmit'], cleanDir);
  console.log('✓ Scaffolded project passed validation and typechecking.');

  // 9. Test Library launch & HTTP responsiveness
  console.log('\n[clean-verify] Testing MotionKit Library launch on port 4180...');
  const libProc = spawn(isWin ? 'cmd.exe' : 'npx', isWin ? ['/d', '/s', '/c', 'npx vite --port 4180 --strictPort'] : ['vite', '--port', '4180', '--strictPort'], {
    cwd: cleanDir,
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    const status = await waitForHttp('http://127.0.0.1:4180');
    console.log(`✓ MotionKit Library started and responded with HTTP ${status}.`);
  } finally {
    if (isWin) {
      spawnSync('taskkill', ['/pid', String(libProc.pid), '/T', '/F']);
    } else {
      libProc.kill('SIGTERM');
    }
  }

  // 10. Test Remotion Studio startup & diagnostic stills
  console.log('\n[clean-verify] Testing Remotion diagnostic still render for Focus-Doodle-Vertical...');
  run('node', ['scripts/stills.mjs', 'Focus-Doodle-Vertical', '2.5'], cleanDir);
  console.log('✓ Remotion still render verified.');

  console.log(`\n======================================================`);
  console.log(`  ALL STANDALONE VERIFICATION GATES PASSED!           `);
  console.log(`  The source ZIP is 100% self-contained and viable.  `);
  console.log(`======================================================\n`);
} finally {
  console.log(`Cleaning up test directory: ${cleanDir}`);
  try {
    rmSync(cleanDir, {recursive: true, force: true});
    console.log('✓ Test directory cleanly removed.');
  } catch (err) {
    console.warn(`Could not completely remove ${cleanDir}: ${err.message}`);
  }
}
