import type {FC, ReactNode} from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  CountUpStat,
  KineticStack,
  SocialPromoPulse,
  WhiteboardExplainer,
} from './components/MotionPresets';

const FadedScene: FC<{children: ReactNode; duration: number}> = ({children, duration}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, duration - 12, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

export const ShowcaseComposition: FC = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: '#0d1016'}}>
      <Sequence from={0} durationInFrames={4 * fps} premountFor={fps}>
        <FadedScene duration={4 * fps}>
          <KineticStack text="الفكرة تتحرك أمامك" secondaryText="MotionKit" accent="#8f8aff" direction="rtl" />
        </FadedScene>
      </Sequence>
      <Sequence from={3.5 * fps} durationInFrames={4 * fps} premountFor={fps}>
        <FadedScene duration={4 * fps}>
          <WhiteboardExplainer text="Draw the logic" secondaryText="One visual relationship at a time" accent="#2368d8" direction="ltr" />
        </FadedScene>
      </Sequence>
      <Sequence from={7 * fps} durationInFrames={4 * fps} premountFor={fps}>
        <FadedScene duration={4 * fps}>
          <CountUpStat text="Deterministic" secondaryText="The same frame, every time" accent="#f4b548" direction="ltr" />
        </FadedScene>
      </Sequence>
      <Sequence from={10.5 * fps} durationInFrames={4.5 * fps} premountFor={fps}>
        <FadedScene duration={4.5 * fps}>
          <SocialPromoPulse text="Build. Preview. Refine." secondaryText="The owner decides when the final video leaves the studio." accent="#4f7cff" direction="ltr" />
        </FadedScene>
      </Sequence>
    </AbsoluteFill>
  );
};
