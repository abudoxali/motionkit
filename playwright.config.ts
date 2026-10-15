import {defineConfig, devices} from '@playwright/test';

// Browser regression suite. Playwright starts its own Vite dev server on a dedicated port, so no
// manually running library or Remotion Studio is needed or reused. The Studio URL is pinned to a
// fake address so link generation is deterministic.
//
// Visual baselines are platform-specific (font rasterisation differs per OS) and are never
// written by a normal run: `updateSnapshots: 'none'` makes a missing or changed baseline fail.
// Accepting new baselines is explicit: `npm run test:visual:update` (see .agents/skills/quality-assurance).

const PORT = 4317;
export const STUDIO_URL_UNDER_TEST = 'http://127.0.0.1:3999';

const pinned = {
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  colorScheme: 'dark' as const,
  locale: 'en-US',
  timezoneId: 'UTC',
  reducedMotion: 'reduce' as const,
};

export default defineConfig({
  testDir: 'e2e',
  // Generates the synthetic QA media for media.spec.ts when it is missing (needs FFmpeg).
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 2,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [['list'], ['html', {outputFolder: 'playwright-report', open: 'never'}]],
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/baselines/{arg}-{platform}{ext}',
  expect: {
    timeout: 15_000,
    // Same-machine renders are pixel-stable (verified over repeated runs), so the budget is zero: a
    // ratio-based tolerance let a changed 8px label through in a negative-control run.
    toHaveScreenshot: {maxDiffPixels: 0, threshold: 0.1, animations: 'disabled', caret: 'hide', scale: 'css'},
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {name: 'library-desktop', testMatch: /library\.spec\.ts/, use: {...pinned, viewport: {width: 1440, height: 900}}},
    {
      name: 'library-mobile',
      testMatch: /library\.spec\.ts/,
      use: {...devices['Pixel 5'], ...pinned, viewport: {width: 375, height: 812}, isMobile: true, hasTouch: true},
    },
    {name: 'typography', testMatch: /typography\.spec\.ts/, use: {...pinned, viewport: {width: 1280, height: 1000}}},
    {name: 'presets', testMatch: /presets\.spec\.ts/, use: {...pinned, viewport: {width: 1280, height: 1000}}},
    {name: 'styles', testMatch: /styles\.spec\.ts/, use: {...pinned, viewport: {width: 1280, height: 1000}}},
    {name: 'media', testMatch: /media\.spec\.ts/, use: {...pinned, viewport: {width: 1280, height: 1000}}},
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // ABUD_E2E turns off Vite's live-reload socket: tests never edit files, and under a full Windows
    // run that socket once failed to connect (ERR_NO_BUFFER_SPACE), tripping the console checks.
    env: {VITE_REMOTION_STUDIO_URL: STUDIO_URL_UNDER_TEST, ABUD_E2E: '1'},
  },
});
