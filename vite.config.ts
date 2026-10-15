/// <reference types="vitest/config" />
import {rmSync} from 'node:fs';
import path from 'node:path';
import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import react from '@vitejs/plugin-react';

// Vendor libraries change far less often than the library app, so they get their own long-lived
// chunks. The Remotion Player and project compositions are already loaded lazily by the app.
const vendorChunk = (id: string) => {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
  if (/node_modules[\\/]remotion[\\/]/.test(id)) return 'vendor-remotion';
  return undefined;
};

// Owner media in public/user-assets/ is served by the dev server (library previews) but must never
// be copied into a build: Vite copies public/ wholesale, so the folder is removed from the output.
const excludePrivateMedia = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'abud-exclude-private-media',
    apply: 'build',
    configResolved: (config) => {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle: () => rmSync(path.join(outDir, 'user-assets'), {recursive: true, force: true}),
  };
};

export default defineConfig({
  plugins: [react(), excludePrivateMedia()],
  // The Playwright server (ABUD_E2E=1) runs without live reload; see playwright.config.ts.
  server: {host: '127.0.0.1', port: 4173, hmr: process.env.ABUD_E2E === '1' ? false : undefined},
  preview: {host: '127.0.0.1', port: 4173},
  build: {outDir: 'dist', rollupOptions: {output: {manualChunks: vendorChunk}}},
  // Unit tests only; Playwright owns e2e/.
  test: {include: ['src/**/*.test.{ts,tsx}']},
});
