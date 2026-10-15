export type ExportRequest = {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  confirmation: string;
  compositionId: string;
};

export type ExportDecision =
  | {allowed: true; reason: 'confirmed'}
  | {
      allowed: false;
      reason: 'interactive-terminal-required' | 'confirmation-mismatch';
    };

export const evaluateExportRequest = ({
  stdinIsTTY,
  stdoutIsTTY,
  confirmation,
  compositionId,
}: ExportRequest): ExportDecision => {
  if (!stdinIsTTY || !stdoutIsTTY) {
    return {allowed: false, reason: 'interactive-terminal-required'};
  }

  if (confirmation.trim() !== `EXPORT ${compositionId}`) {
    return {allowed: false, reason: 'confirmation-mismatch'};
  }

  return {allowed: true, reason: 'confirmed'};
};
