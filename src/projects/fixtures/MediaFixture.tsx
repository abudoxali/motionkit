import type {FC} from 'react';
import {AbsoluteFill} from 'remotion';
import {useCanvas} from '../../motion/core/layout';
import {
  CharacterSprite,
  LayeredCharacter,
  MusicBed,
  ProjectMediaProvider,
  ScreenshotFrame,
  SoundCue,
  VoiceoverCaptions,
  VoiceoverTrack,
} from '../../motion/media';
import {SceneTimeline} from '../../motion/scenes/SceneTimeline';
import {FittedText} from '../../motion/typography/components';
import {projectTimeline} from '../contract';
import {MEDIA_FIXTURE_ASSETS as A, mediaFixtureMeta} from './media';
import type {MediaFixtureProps} from './media';

// Exercises the owner-media components with synthetic media (npm run qa:media). Layout is computed
// from the canvas, so the same code serves 16:9, 9:16, and 1:1.

const VOICE_FROM = mediaFixtureMeta.media?.voiceoverFrom ?? 0;

const Backdrop: FC<{hue: number}> = ({hue}) => (
  <AbsoluteFill style={{background: `linear-gradient(140deg, hsl(${hue} 32% 14%), hsl(${hue + 40} 30% 22%))`}} />
);

const Label: FC<{text: string}> = ({text}) => {
  const {safeRect, vmin} = useCanvas();
  return (
    <div style={{position: 'absolute', left: safeRect.x, top: safeRect.y, width: safeRect.width}}>
      <FittedText text={text} box={{width: safeRect.width, height: vmin * 7}} level="heading" color="#f4efe4" maxLines={1} minSize={vmin * 2.4} maxSize={vmin * 4.2} fitHeight />
    </div>
  );
};

const DesktopScene: FC = () => {
  const {safeRect, vmin} = useCanvas();
  const top = safeRect.y + vmin * 8;
  const box = {x: safeRect.x, y: top, width: safeRect.width, height: safeRect.y + safeRect.height * 0.74 - top};
  return (
    <AbsoluteFill>
      <Backdrop hue={215} />
      <Label text="Desktop screenshot — zoom and highlight" />
      <ScreenshotFrame
        asset={A.desktop}
        box={box}
        device="browser"
        enter={{type: 'rise', frame: 0, duration: 20}}
        zoom={[{frame: 30, scale: 1}, {frame: 85, scale: 1.7, focus: [0.72, 0.28]}]}
        highlights={[{region: [0.55, 0.12, 0.34, 0.3], from: 45, style: 'box'}]}
      />
    </AbsoluteFill>
  );
};

const PhoneScene: FC = () => {
  const {safeRect, vmin, orientation} = useCanvas();
  const top = safeRect.y + vmin * 8;
  const height = safeRect.y + safeRect.height * 0.74 - top;
  const gap = vmin * 3;
  // Side by side on wide canvases, stacked on tall ones.
  const wide = orientation !== 'portrait';
  const phone = wide ? {x: safeRect.x + safeRect.width / 2 + gap / 2, y: top, width: safeRect.width / 2 - gap / 2, height} : {x: safeRect.x, y: top + height * 0.38 + gap, width: safeRect.width, height: height * 0.62 - gap};
  const crop = wide ? {x: safeRect.x, y: top, width: safeRect.width / 2 - gap / 2, height} : {x: safeRect.x, y: top, width: safeRect.width, height: height * 0.38};
  return (
    <AbsoluteFill>
      <Backdrop hue={160} />
      <Label text="Phone screenshot — spotlight, and a cover crop" />
      <ScreenshotFrame asset={A.desktop} box={crop} device="card" fit="cover" focus={[0.8, 0.2]} enter={{type: 'fade', frame: 0, duration: 15}} />
      <ScreenshotFrame
        asset={A.phone}
        box={phone}
        device="phone"
        enter={{type: 'slide-end', frame: 5, duration: 20}}
        highlights={[{region: [0.08, 0.36, 0.84, 0.16], from: 40, style: 'spotlight'}]}
      />
    </AbsoluteFill>
  );
};

const CharacterScene: FC = () => {
  const {safeRect, vmin} = useCanvas();
  const ground = safeRect.y + safeRect.height * 0.74;
  const height = safeRect.height * 0.5;
  return (
    <AbsoluteFill>
      <Backdrop hue={30} />
      <Label text="Supplied poses, and a layered rig with pivots" />
      <div style={{position: 'absolute', left: 0, right: 0, top: ground, height: vmin * 0.5, background: 'rgba(244,239,228,0.35)'}} />
      <CharacterSprite
        poses={[{asset: A.poseA, from: 0}, {asset: A.poseB, from: 45}]}
        height={height}
        x={safeRect.x + safeRect.width * 0.2}
        y={ground}
        keys={[{frame: 0, x: safeRect.x + safeRect.width * 0.12}, {frame: 60, x: safeRect.x + safeRect.width * 0.3, ease: 'smooth'}]}
        idle={{bob: vmin * 0.6, period: 30}}
        enter={{type: 'fade', frame: 0, duration: 12}}
        groundShadow
      />
      <LayeredCharacter
        size={{width: 400, height: 800}}
        height={height}
        x={safeRect.x + safeRect.width * 0.72}
        y={ground}
        idle={{breathe: 0.01, period: 48}}
        enter={{type: 'pop', frame: 10, duration: 18}}
        groundShadow
        layers={[
          {id: 'torso', asset: A.torso, x: 100, y: 300, width: 200},
          {id: 'head', asset: A.head, parent: 'torso', x: 20, y: -170, width: 160, pivot: [0.5, 0.95], rotate: {swing: 5, period: 50}},
          {id: 'arm-back', asset: A.arm, parent: 'torso', x: -10, y: 20, width: 56, pivot: [0.5, 0.1], z: -1, rotate: {swing: 12, period: 40, phase: 20, rest: 8}},
          {id: 'arm-front', asset: A.arm, parent: 'torso', x: 154, y: 20, width: 56, pivot: [0.5, 0.1], z: 1, rotate: [[0, 0], [30, -70], [60, -40], [90, -70]]},
        ]}
      />
    </AbsoluteFill>
  );
};

export const MediaFixture: FC<Partial<MediaFixtureProps>> = ({captionVoiceover = A.voiceover}) => (
  <ProjectMediaProvider projectId={mediaFixtureMeta.id}>
    <AbsoluteFill style={{background: '#10131a'}}>
      <SceneTimeline scenes={projectTimeline(mediaFixtureMeta)} transition="fade" durationInFrames={mediaFixtureMeta.durationInFrames}>
        {{desktop: <DesktopScene />, phone: <PhoneScene />, characters: <CharacterScene />}}
      </SceneTimeline>
      <VoiceoverCaptions voiceover={captionVoiceover} from={VOICE_FROM} mode="word" fallbackDirection={captionVoiceover === A.voiceover ? 'ltr' : 'rtl'} />
      <VoiceoverTrack asset={A.voiceover} from={VOICE_FROM} />
      <MusicBed asset={A.music} duckUnder={A.voiceover} voiceoverFrom={VOICE_FROM} />
      <SoundCue asset={A.sfx} at={110} />
      <SoundCue asset={A.sfx} at={210} />
    </AbsoluteFill>
  </ProjectMediaProvider>
);

export default MediaFixture;
