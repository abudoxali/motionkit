import type {ComponentType} from 'react';
import {Player} from '@remotion/player';

// Loaded lazily by LibraryApp so the catalog shell renders before the Remotion Player arrives.

type Source =
  | {component: ComponentType<Record<string, unknown>>; lazyComponent?: never}
  | {lazyComponent: () => Promise<{default: ComponentType<Record<string, unknown>>}>; component?: never};

export type PreviewPlayerProps = Source & {
  playerKey: string;
  inputProps?: Record<string, unknown>;
  durationInFrames: number;
  /** Frame shown before playback; defaults to the first frame. */
  initialFrame?: number;
  fps: number;
  width: number;
  height: number;
};

const displayWidth = (width: number, height: number) =>
  height > width * 1.2 ? 'min(100%, 430px)' : Math.abs(width - height) < 2 ? 'min(100%, 720px)' : '100%';

const PreviewPlayer = ({playerKey, inputProps, durationInFrames, initialFrame = 0, fps, width, height, ...source}: PreviewPlayerProps) => (
  <Player
    key={playerKey}
    {...source}
    inputProps={inputProps}
    durationInFrames={durationInFrames}
    initialFrame={initialFrame}
    compositionWidth={width}
    compositionHeight={height}
    fps={fps}
    controls
    loop
    autoPlay={false}
    acknowledgeRemotionLicense
    style={{width: displayWidth(width, height), aspectRatio: `${width} / ${height}`}}
  />
);

export default PreviewPlayer;
