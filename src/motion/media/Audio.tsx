import type {FC} from 'react';
import {Html5Audio, Sequence, useVideoConfig} from 'remotion';
import type {AudioMetadata} from './manifest';
import {MissingAsset, useRequiredAsset, useVoiceoverTiming} from './ProjectMedia';
import {duckedVolume, speechFrames} from './timing';

// Basic, reusable sound: the voiceover (played exactly as recorded), an optional music bed that
// fades and ducks under speech, and one-shot cues. Volume curves are frame-pure. Voice clarity wins:
// music defaults are low and always duck while the narration speaks.

const MissingBadge: FC<{reason: string}> = ({reason}) => (
  <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 120}}>
    <MissingAsset reason={reason} style={{fontSize: 18}} />
  </div>
);

export type VoiceoverTrackProps = {
  asset: string;
  /** Composition frame where the voiceover starts (lead-in before the first word). */
  from?: number;
  volume?: number;
};

/** The owner's narration, unmodified: no trimming, stretching, or speed change. */
export const VoiceoverTrack: FC<VoiceoverTrackProps> = ({asset, from = 0, volume = 1}) => {
  const state = useRequiredAsset(asset, {kind: 'audio', roles: ['voiceover']});
  if (state.status === 'loading') return null;
  if (state.status === 'missing') return <MissingBadge reason={state.reason} />;
  return (
    <Sequence from={from} name={`Voiceover ${asset}`} layout="none">
      <Html5Audio src={state.src} volume={volume} />
    </Sequence>
  );
};

export type MusicBedProps = {
  asset: string;
  from?: number;
  /** Frames the bed plays; defaults to the rest of the composition. */
  durationInFrames?: number;
  volume?: number;
  /** Volume while the voiceover speaks. */
  duckedVolume?: number;
  /** Voiceover asset id whose timing drives ducking. */
  duckUnder?: string;
  /** Composition frame the ducking voiceover starts at (its VoiceoverTrack `from`). */
  voiceoverFrom?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  loop?: boolean;
};

export const MusicBed: FC<MusicBedProps> = ({
  asset,
  from = 0,
  durationInFrames,
  volume = 0.16,
  duckedVolume: ducked = 0.05,
  duckUnder,
  voiceoverFrom = 0,
  fadeInFrames = 20,
  fadeOutFrames = 45,
  loop = true,
}) => {
  const {fps, durationInFrames: total} = useVideoConfig();
  const state = useRequiredAsset(asset, {kind: 'audio', roles: ['music', 'sfx']});
  const timing = useVoiceoverTiming(duckUnder);
  if (state.status === 'loading' || (duckUnder && timing.status === 'loading')) return null;
  if (state.status === 'missing') return <MissingBadge reason={state.reason} />;
  // Without verified timing the bed simply stays at the ducked level under the whole voiceover.
  const length = durationInFrames ?? total - from;
  const speech: [number, number][] = duckUnder
    ? timing.status === 'ready'
      ? speechFrames(timing.timing, fps).map(([a, b]) => [a + voiceoverFrom - from, b + voiceoverFrom - from])
      : [[voiceoverFrom - from, length]]
    : [];
  const sourceFrames = Math.ceil((state.asset.metadata as AudioMetadata).durationSeconds * fps);
  return (
    <Sequence from={from} durationInFrames={length} name={`Music ${asset}`} layout="none">
      <Html5Audio
        src={state.src}
        loop={loop && sourceFrames < length}
        volume={(frame) => duckedVolume(frame, {base: volume, ducked, speech, durationInFrames: length, fadeIn: fadeInFrames, fadeOut: fadeOutFrames})}
      />
    </Sequence>
  );
};

/** A one-shot sound effect at a frame. */
export const SoundCue: FC<{asset: string; at: number; volume?: number}> = ({asset, at, volume = 0.5}) => {
  const state = useRequiredAsset(asset, {kind: 'audio', roles: ['sfx', 'music']});
  if (state.status === 'loading') return null;
  if (state.status === 'missing') return <MissingBadge reason={state.reason} />;
  return (
    <Sequence from={at} name={`SFX ${asset}`} layout="none">
      <Html5Audio src={state.src} volume={volume} />
    </Sequence>
  );
};
