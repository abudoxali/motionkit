import {defineProject, defineScenes} from '../contract';

// Media QA fixture: every owner-media component (screenshots in device frames with zoom and
// highlights, cover cropping, a posed sprite, a layered rig, voiceover, ducked music, a cue, and
// word-timed captions) driven by synthetic media that `npm run qa:media` generates and imports
// through the real importer. Without that step the fixture shows explicit missing-media cards.

export const MEDIA_FIXTURE_ASSETS = {
  desktop: 'screen-desktop',
  phone: 'screen-phone',
  poseA: 'hero-pose-a',
  poseB: 'hero-pose-b',
  torso: 'rig-torso',
  head: 'rig-head',
  arm: 'rig-arm',
  voiceover: 'voiceover',
  /** Tone "voice" with owner-supplied Arabic/English word timing, for RTL caption coverage. */
  voiceoverMixed: 'voiceover-mixed',
  music: 'music-bed',
  sfx: 'sfx-pop',
} as const;

export type MediaFixtureProps = {
  /** Which voiceover's timing drives the captions: the English speech or the mixed Arabic track. */
  captionVoiceover: string;
};

export const mediaFixtureMeta = defineProject<MediaFixtureProps>({
  id: 'qa-media',
  title: 'Media QA · Screenshots, characters, voiceover',
  summary: 'Synthetic screenshots, transparent character art, a layered rig, voiceover with captions, ducked music, and a cue — imported with npm run qa:media.',
  kind: 'fixture',
  language: 'en',
  direction: 'ltr',
  fps: 30,
  durationInFrames: 300,
  compositions: [
    {id: 'QA-Media-Horizontal', format: 'horizontal'},
    {id: 'QA-Media-Vertical', format: 'vertical'},
    {id: 'QA-Media-Square', format: 'square'},
  ],
  styleId: 'custom',
  scenes: defineScenes([
    {id: 'desktop', title: 'Desktop screenshot: zoom and highlight', durationInFrames: 110},
    {id: 'phone', title: 'Phone screenshot and cover crop', durationInFrames: 110, transitionInFrames: 10},
    {id: 'characters', title: 'Posed sprite and layered rig', durationInFrames: 100, transitionInFrames: 10},
  ]),
  fonts: ['display', 'text'],
  assets: [],
  media: {assets: Object.values(MEDIA_FIXTURE_ASSETS), voiceover: MEDIA_FIXTURE_ASSETS.voiceover, voiceoverFrom: 15},
  defaultProps: {captionVoiceover: MEDIA_FIXTURE_ASSETS.voiceover},
  editableProps: ['captionVoiceover'],
  status: {stage: 'review-ready', notes: 'Synthetic media only. Run npm run qa:media to generate and import it into the git-ignored public/user-assets/qa-media/.'},
});
