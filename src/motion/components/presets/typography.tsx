import type {FC} from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {PresetProps} from '../../types';
import {FittedText, HighlightedPhrase, MixedText, splitWords, useFittedStack} from '../../typography';
import {Canvas, Copy, clamp, usePresetFrame, useSafePadding} from './shared';

// Typography-led presets. Motion, colour, and artwork are unchanged from the original catalog;
// copy is measured and fitted instead of using fixed pixel sizes.

export const KineticStack: FC<PresetProps> = ({text, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const pad = useSafePadding(0.08);
  const words = splitWords(text ?? '').slice(0, 5);
  // Up to five words, one per line, all at one size so the stack keeps its rhythm.
  const gap = 4;
  const box = {width: pad.innerWidth, height: pad.innerHeight - gap * Math.max(0, words.length - 1)};
  const stack = useFittedStack(words, box, {role: typeface, weight: 800, level: 'display', direction, maxSize: Math.max(64, width * 0.075), minSize: 24});
  return (
    <Canvas typeface={typeface} style={{justifyContent: 'center', padding: pad.css}}>
      <div dir={direction} data-typography-fit={stack ? (stack.overflow ? 'overflow' : 'ok') : 'pending'} style={{display: 'grid', gap, visibility: stack ? 'visible' : 'hidden'}}>
        {words.map((word, index) => {
          const progress = spring({frame: frame - index * 5, fps, config: {damping: 18, stiffness: 180, mass: 0.7}});
          return (
            <div
              key={`${word}-${index}`}
              style={{
                alignSelf: direction === 'rtl' ? 'end' : 'start',
                color: index === 1 ? accent : '#f5f1e8',
                fontSize: stack?.fontSize,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                lineHeight: stack?.lineHeight,
                paddingInline: stack?.inkPadding,
                opacity: progress,
                translate: `${(1 - progress) * (index % 2 ? -90 : 90)}px 0`,
              }}
            >
              <MixedText text={word} direction={direction} />
            </div>
          );
        })}
      </div>
    </Canvas>
  );
};

export const TitleOrbit: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {safeRect} = usePresetFrame();
  const reveal = spring({frame, fps, config: {damping: 22, stiffness: 100}});
  const copyWidth = Math.min(580, safeRect.width);
  return (
    <Canvas typeface={typeface} style={{alignItems: 'center', justifyContent: 'center'}}>
      {[0, 1, 2].map((ring) => (
        <div
          key={ring}
          style={{
            position: 'absolute',
            width: 250 + ring * 82,
            height: 250 + ring * 82,
            border: `2px solid ${ring === 1 ? accent : '#313743'}`,
            borderRadius: '50%',
            rotate: `${frame * (ring % 2 ? -0.35 : 0.25) + ring * 20}deg`,
            scale: reveal,
          }}
        >
          <div style={{width: 13, height: 13, borderRadius: '50%', background: accent, translate: '-7px 50px', boxShadow: `0 0 22px ${accent}`}} />
        </div>
      ))}
      <div dir={direction} style={{zIndex: 1, opacity: reveal, display: 'grid', justifyItems: 'center', gap: 14}}>
        <Copy text={text} width={copyWidth} height={170} size={60} minSize={28} weight={700} direction={direction} role={typeface} align="center" verticalAlign="center" />
        <Copy text={secondaryText} width={copyWidth} height={64} size={20} minSize={14} weight={400} direction={direction} role={typeface} align="center" color="#aeb5c0" maxLines={2} />
      </div>
    </Canvas>
  );
};

export const LowerThirdBeam: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width, height, safe} = usePresetFrame();
  const panel = interpolate(frame, [4, 24], [-110, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  const beam = interpolate(frame, [12, 36], [0, 1], clamp);
  // The panel keeps its broadcast proportions; copy is fitted inside it.
  const panelWidth = Math.max(width * 0.88 * 0.52, Math.min(width * 0.88, 720));
  const copyWidth = panelWidth - 64;
  return (
    <Canvas typeface={typeface} background="#171b24">
      <div
        dir={direction}
        style={{
          position: 'absolute',
          left: '6%',
          right: '6%',
          bottom: Math.max(height * 0.1, safe.bottom),
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: direction === 'rtl' ? 'flex-end' : 'flex-start',
          translate: `${direction === 'rtl' ? -panel : panel}px 0`,
        }}
      >
        <div style={{width: 10, background: accent, boxShadow: `0 0 26px ${accent}`}} />
        <div style={{background: '#f6f3ec', color: '#12151c', padding: '23px 32px', width: panelWidth, display: 'grid', gap: 4}}>
          <Copy text={text} width={copyWidth} height={96} size={34} minSize={16} weight={700} direction={direction} role={typeface} maxLines={2} />
          <Copy text={secondaryText} width={copyWidth} height={28} size={18} minSize={12} weight={400} direction={direction} role={typeface} color="#5b616b" maxLines={1} />
        </div>
      </div>
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(110deg, transparent ${55 - beam * 20}%, ${accent}22 ${60 - beam * 5}%, transparent ${66 + beam * 30}%)`}} />
    </Canvas>
  );
};

export const MarkerHighlight: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const pad = useSafePadding(0.08);
  const progress = interpolate(frame, [8, 40], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const words = splitWords(text ?? '').length;
  return (
    <Canvas typeface={typeface} background="#f1efe7" color="#20242b" style={{alignItems: 'center', justifyContent: 'center', padding: pad.css}}>
      <HighlightedPhrase text={text ?? ''} direction={direction} role={typeface} weight={700} level="heading" align="center" verticalAlign="center" highlight={[0, words]} accent={accent} progress={progress} box={{width: Math.round(pad.innerWidth), height: Math.round(Math.min(height * 0.42, pad.innerHeight - 66))}} maxSize={Math.round(Math.min(width, height) * 0.1)} />
      <div style={{marginTop: 26}}>
        <Copy text={secondaryText} width={pad.innerWidth} height={40} size={21} minSize={13} weight={400} direction={direction} role="text" align="center" color="#5b6168" maxLines={1} />
      </div>
    </Canvas>
  );
};

export const WordCascadeSubtitles: FC<PresetProps> = ({text, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const pad = useSafePadding(0.09);
  const box = {width: Math.floor(pad.innerWidth * 0.86), height: Math.floor(Math.min(height * 0.36, pad.innerHeight))};
  return (
    <Canvas typeface={typeface} background="#0d1016" style={{alignItems: 'center', justifyContent: 'flex-end', padding: pad.css}}>
      {/* One weight for every word: per-word weight changes would re-wrap the fitted lines. */}
      <FittedText
        text={text ?? ''}
        box={box}
        direction={direction}
        role={typeface}
        weight={600}
        align="center"
        verticalAlign="end"
        maxSize={38}
        minSize={20}
        renderLine={(line, lineIndex, layout) => {
          const offset = layout.lines.slice(0, lineIndex).reduce((sum, item) => sum + splitWords(item).length, 0);
          const lineWords = splitWords(line);
          return lineWords.map((word, wordIndex) => {
            const index = offset + wordIndex;
            const visible = interpolate(frame, [index * 7, index * 7 + 8], [0, 1], clamp);
            const active = frame >= index * 7 && frame < index * 7 + 14;
            return (
              <span key={index} style={{display: 'inline-block', color: active ? accent : '#f8f5ed', opacity: visible, translate: `0 ${(1 - visible) * 24}px`}}>
                <MixedText text={word} direction={layout.direction} />
                {wordIndex < lineWords.length - 1 ? ' ' : null}
              </span>
            );
          });
        }}
      />
    </Canvas>
  );
};
