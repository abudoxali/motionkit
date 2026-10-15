export type FocusBeatId = 'overwhelmed' | 'accumulation' | 'decision' | 'resolution';

export type FocusBeat = {
  readonly id: FocusBeatId;
  readonly from: number;
  readonly durationInFrames: number;
  readonly reviewSecond: number;
};

export const focusDoodleProject = {
  compositionId: 'Focus-Doodle-Vertical',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 900,
  beats: [
    {id: 'overwhelmed', from: 0, durationInFrames: 225, reviewSecond: 3.5},
    {id: 'accumulation', from: 225, durationInFrames: 225, reviewSecond: 11},
    {id: 'decision', from: 450, durationInFrames: 225, reviewSecond: 18.5},
    {id: 'resolution', from: 675, durationInFrames: 225, reviewSecond: 27},
  ] satisfies readonly FocusBeat[],
} as const;

export const getFocusBeatAtFrame = (frame: number): FocusBeat => {
  if (!Number.isInteger(frame) || frame < 0 || frame >= focusDoodleProject.durationInFrames) {
    throw new RangeError(`Frame ${frame} is outside the Focus Doodle composition.`);
  }

  const beat = focusDoodleProject.beats.find(
    (candidate) => frame >= candidate.from && frame < candidate.from + candidate.durationInFrames,
  );

  if (!beat) {
    throw new Error(`No narrative beat owns frame ${frame}.`);
  }

  return beat;
};
