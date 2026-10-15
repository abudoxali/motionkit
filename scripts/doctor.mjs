#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

const probe = (cmd, args) => {
  const execCmd = isWin && cmd === 'npm' ? 'cmd.exe' : cmd;
  const execArgs = isWin && cmd === 'npm' ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
  const res = spawnSync(execCmd, execArgs, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  return res.error || res.status !== 0 ? null :
    (res.stdout || res.stderr || '').trim().split(/\r?\n/)[0] || 'installed';
};

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

const checks = [
  {name: 'Node.js', required: true, version: process.version,
    ok: Number(process.versions.node.split('.')[0]) >= 20, advice: 'Install Node.js 20 or newer.'},
  {name: 'Git', required: true, version: probe('git', ['--version']), advice: 'Install Git.'},
  {name: 'npm', required: true, version: probe('npm', ['--version']), advice: 'Install npm (bundled with Node.js).'},
  {name: 'FFmpeg', required: false, version: probe('ffmpeg', ['-version']),
    advice: 'Optional: needed for importing and inspecting owner audio/video.'},
  {name: 'ffprobe', required: false, version: probe('ffprobe', ['-version']),
    advice: 'Optional: needed for media metadata.'},
  {name: 'uv', required: false, version: probe('uv', ['--version']),
    advice: 'Optional: local alignment and reference scripts.'},
];

console.log(`
┌────────────────────────────────────────────────────────┐
│  MotionKit — Developer Environment Readiness Check      │
│  Direct the idea. Code the motion. (by ABUD FUN)       │
└────────────────────────────────────────────────────────┘
`);

console.log(`Platform: ${os.platform()} (${os.arch()}), ${os.cpus().length} CPUs, ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB RAM\n`);

let failed = false;
for (const item of checks) {
  const good = item.ok ?? Boolean(item.version);
  console.log((good ? '[OK]   ' : item.required ? '[FAIL] ' : '[OPT]  ') +
    item.name + ': ' + (item.version || 'not found'));
  if (!good) {
    console.log('        ' + item.advice);
    if (item.required) failed = true;
  }
}

const installed = existsSync(path.join(root, 'node_modules'));
console.log((installed ? '[OK]   ' : '[NEXT] ') + 'Dependencies: ' +
  (installed ? 'node_modules found' : 'run npm ci'));

// Check ports
const libPortFree = await checkPort(4173);
const studioPortFree = await checkPort(3000);

console.log('\nNetwork Ports:');
console.log((libPortFree ? '[OK]   ' : '[NOTE] ') + `Port 4173 (Library): ${libPortFree ? 'available' : 'in use'}`);
console.log((studioPortFree ? '[OK]   ' : '[NOTE] ') + `Port 3000 (Remotion Studio): ${studioPortFree ? 'available' : 'in use (override with STUDIO_PORT=3100)'}`);

console.log('\nQuick Start:');
console.log('  1. npm start           (launches both Library & Studio with unified shutdown)');
console.log('  2. npm run library     (visual motion library only: http://127.0.0.1:4173)');
console.log('  3. npm run studio:open (Remotion Studio only: http://localhost:3000)');
console.log('\nAgent Integration:');
console.log('  Start Claude Code or Codex inside this folder to create or revise motion graphics.');
console.log('  Manual export: Video rendering (MP4) is owner-controlled via interactive terminal.');

if (failed) process.exitCode = 1;
