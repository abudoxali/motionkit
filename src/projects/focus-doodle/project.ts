import {defineProject} from '../contract';
import {focusDoodleProject} from './timeline';

const sceneTitles = {
  overwhelmed: 'Overwhelmed at the desk',
  accumulation: 'Distractions pile up',
  decision: 'Choosing the one task',
  resolution: 'Focused finish',
} as const;

/** Contract view of the existing production; timeline.ts stays the source of its beats. */
export const focusDoodleMeta = defineProject({
  id: 'focus-doodle',
  title: 'Focus Doodle',
  summary: 'Egyptian Arabic doodle short about choosing one task over a pile of distractions.',
  kind: 'production',
  language: 'ar',
  direction: 'rtl',
  fps: focusDoodleProject.fps,
  durationInFrames: focusDoodleProject.durationInFrames,
  compositions: [{id: focusDoodleProject.compositionId, format: 'vertical'}],
  styleId: 'doodle',
  scenes: focusDoodleProject.beats.map((beat) => ({
    id: beat.id,
    title: sceneTitles[beat.id],
    from: beat.from,
    durationInFrames: beat.durationInFrames,
    reviewFrame: Math.round(beat.reviewSecond * focusDoodleProject.fps),
  })),
  // Kept on its original system font stack so its approved-for-review look does not change;
  // migrating it to the bundled fonts is an owner decision (see STATUS.md).
  fonts: [],
  assets: [],
  defaultProps: {},
  editableProps: [],
  docsPath: 'projects/focus-doodle',
  status: {
    stage: 'review-ready',
    lastVerified: '2026-10-13',
    notes: 'Awaiting owner creative acceptance. Compatibility fixture: do not revise creatively.',
  },
});
