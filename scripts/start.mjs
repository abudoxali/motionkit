#!/usr/bin/env node
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

const checkPort = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => {
      resolve(err.code === 'EADDRINUSE' ? false : true);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });

const findAvailablePort = async (startPort, host = '127.0.0.1') => {
  let port = startPort;
  while (!(await checkPort(port, host))) {
    port++;
    if (port > startPort + 50) return null;
  }
  return port;
};

const killProcessGroup = (child) => {
  if (!child || !child.pid) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true});
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    // Process already exited
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const libraryOnly = args.includes('--library-only') || args.includes('--library');
  const studioOnly = args.includes('--studio-only') || args.includes('--studio');

  console.log(`
  \x1b[1m\x1b[38;2;143;138;255m┌────────────────────────────────────────────────────────┐\x1b[0m
  \x1b[1m\x1b[38;2;143;138;255m│\x1b[0m  \x1b[1m\x1b[37mMotionKit Launcher\x1b[0m · by ABUD FUN                      \x1b[1m\x1b[38;2;143;138;255m│\x1b[0m
  \x1b[1m\x1b[38;2;143;138;255m│\x1b[0m  \x1b[38;2;112;225;196mDirect the idea. Code the motion.\x1b[0m                     \x1b[1m\x1b[38;2;143;138;255m│\x1b[0m
  \x1b[1m\x1b[38;2;143;138;255m└────────────────────────────────────────────────────────┘\x1b[0m
`);

  const libraryPort = 4173;
  let studioPort = process.env.STUDIO_PORT ? Number(process.env.STUDIO_PORT) : 3000;

  // Check port availability
  if (!studioOnly) {
    const libAvailable = await checkPort(libraryPort);
    if (!libAvailable) {
      console.warn(`  \x1b[33m[NOTE]\x1b[0m Library port ${libraryPort} is occupied. Vite will select an alternate port.`);
    }
  }

  if (!libraryOnly) {
    const studioAvailable = await checkPort(studioPort);
    if (!studioAvailable) {
      const alt = await findAvailablePort(studioPort + 1);
      if (alt) {
        console.warn(`  \x1b[33m[NOTE]\x1b[0m Studio port ${studioPort} is occupied. Using port ${alt}.`);
        studioPort = alt;
      }
    }
  }

  const children = [];

  const cleanup = () => {
    console.log('\n  Shutting down MotionKit services...');
    for (const child of children) {
      killProcessGroup(child);
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', () => {
    for (const child of children) {
      killProcessGroup(child);
    }
  });

  // Start Library
  if (!studioOnly) {
    console.log(`  \x1b[32m[START]\x1b[0m Launching MotionKit Library on http://127.0.0.1:${libraryPort}...`);
    const libProcess = spawn(
      isWin ? 'cmd.exe' : 'npm',
      isWin ? ['/d', '/s', '/c', 'npm run library'] : ['run', 'library'],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {...process.env, VITE_REMOTION_STUDIO_URL: `http://localhost:${studioPort}`},
      }
    );

    libProcess.stdout?.on('data', (data) => {
      const line = data.toString().trim();
      if (line.includes('Local:')) {
        console.log(`  \x1b[1m\x1b[38;2;112;225;196m➜ Library Ready:\x1b[0m http://127.0.0.1:${libraryPort}`);
      }
    });

    libProcess.stderr?.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('ExperimentalWarning')) {
        if (/error|failed/i.test(text)) console.error(`  [Library] ${text}`);
      }
    });

    children.push(libProcess);
  }

  // Start Remotion Studio
  if (!libraryOnly) {
    console.log(`  \x1b[32m[START]\x1b[0m Launching Remotion Studio on http://localhost:${studioPort}...`);
    const studioProcess = spawn(
      isWin ? 'cmd.exe' : 'npm',
      isWin ? ['/d', '/s', '/c', `npm run studio -- --port=${studioPort}`] : ['run', 'studio', '--', `--port=${studioPort}`],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    studioProcess.stdout?.on('data', (data) => {
      const line = data.toString().trim();
      if (line.includes('http://') || line.includes('Ready')) {
        console.log(`  \x1b[1m\x1b[38;2;143;138;255m➜ Studio Ready:\x1b[0m  http://localhost:${studioPort}`);
      }
    });

    studioProcess.stderr?.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('ExperimentalWarning')) {
        if (/error|failed/i.test(text)) console.error(`  [Studio] ${text}`);
      }
    });

    children.push(studioProcess);
  }

  console.log(`
  \x1b[1mNext Steps:\x1b[0m
  1. Open \x1b[38;2;112;225;196mhttp://127.0.0.1:${libraryPort}\x1b[0m in your browser to inspect styles, presets, and productions.
  2. Open \x1b[38;2;143;138;255mhttp://localhost:${studioPort}\x1b[0m for frame-accurate Remotion timeline review.
  3. Start Claude Code or Codex inside this folder for AI-agent motion creation.
  4. Press \x1b[1mCtrl+C\x1b[0m to stop all services.
`);
};

main().catch((err) => {
  console.error('[MotionKit start failed]:', err);
  process.exit(1);
});
