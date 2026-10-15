import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

describe('manual export command', () => {
  it('refuses execution when stdin is not an interactive terminal', () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/manual-export.ts', 'Showcase-Horizontal'],
      {encoding: 'utf8', input: 'EXPORT Showcase-Horizontal\n'},
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('interactive terminal');
  });
});
