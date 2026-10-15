import {describe, expect, it} from 'vitest';
import {evaluateExportRequest} from '../export-policy';

describe('owner-controlled export policy', () => {
  it('rejects non-interactive execution even with the right phrase', () => {
    expect(
      evaluateExportRequest({
        stdinIsTTY: false,
        stdoutIsTTY: true,
        confirmation: 'EXPORT Showcase-Horizontal',
        compositionId: 'Showcase-Horizontal',
      }),
    ).toEqual({allowed: false, reason: 'interactive-terminal-required'});
  });

  it('rejects an interactive session without the composition-specific phrase', () => {
    expect(
      evaluateExportRequest({
        stdinIsTTY: true,
        stdoutIsTTY: true,
        confirmation: 'yes',
        compositionId: 'Showcase-Vertical',
      }),
    ).toEqual({allowed: false, reason: 'confirmation-mismatch'});
  });

  it('accepts only a matching owner confirmation in an interactive terminal', () => {
    expect(
      evaluateExportRequest({
        stdinIsTTY: true,
        stdoutIsTTY: true,
        confirmation: 'EXPORT Showcase-Square',
        compositionId: 'Showcase-Square',
      }),
    ).toEqual({allowed: true, reason: 'confirmed'});
  });
});
