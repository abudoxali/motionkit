import type {FC} from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {PresetProps} from '../../types';
import {detectDirection} from '../../typography';
import {Canvas, Copy, clamp, usePresetFrame, useSafePadding} from './shared';

// Drawing, camera, data, transition, brand, and social presets. Artwork and motion are unchanged;
// copy is fitted to boxes derived from the canvas and its title-safe area.

export const LogoPrismReveal: FC<PresetProps> = ({text, accent, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame: frame - 4, fps, config: {damping: 13, stiffness: 130}});
  const draw = interpolate(frame, [4, 40], [1, 0], clamp);
  const direction = detectDirection(text ?? '');
  return (
    <Canvas typeface={typeface} style={{alignItems: 'center', justifyContent: 'center'}}>
      <svg width="420" height="420" viewBox="0 0 420 420" style={{scale: pop, rotate: `${(1 - pop) * -30}deg`}}>
        <path d="M210 34 360 120 360 294 210 382 60 294 60 120Z" fill="#161b26" stroke={accent} strokeWidth="11" pathLength="1" strokeDasharray="1" strokeDashoffset={draw} />
        <path d="M210 34 210 210 360 294M210 210 60 294M210 210 360 120" fill="none" stroke="#f6f0e4" strokeWidth="5" opacity="0.75" pathLength="1" strokeDasharray="1" strokeDashoffset={draw} />
      </svg>
      {/* The mark fits inside the hexagon; tight tracking only for Latin, never for Arabic. */}
      <div style={{position: 'absolute', opacity: pop}}>
        <Copy text={text} width={260} height={120} size={46} minSize={13} weight={900} direction={direction} role={typeface} align="center" verticalAlign="center" maxLines={3} style={direction === 'ltr' ? {letterSpacing: -2} : undefined} />
      </div>
    </Canvas>
  );
};

export const HandDrawnRoute: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width, height, safeRect} = usePresetFrame();
  const pad = useSafePadding(0.07);
  const path = interpolate(frame, [5, 66], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const inset = Math.max(width * 0.08, safeRect.x);
  return (
    <Canvas typeface={typeface} background="#f3eedf" color="#24201b" style={{padding: pad.css}}>
      <svg viewBox="0 0 800 390" style={{position: 'absolute', inset: '12% 6%', width: '88%', height: '70%'}}>
        <path d="M70 300 C155 115 275 365 365 186 S590 78 726 205" fill="none" stroke="#d4cab6" strokeWidth="18" strokeLinecap="round" />
        <path d="M70 300 C155 115 275 365 365 186 S590 78 726 205" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={path} />
        {[['70', '300'], ['365', '186'], ['726', '205']].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index === 1 ? 18 : 13} fill={index === 1 ? accent : '#24201b'} opacity={interpolate(frame, [10 + index * 24, 20 + index * 24], [0, 1], clamp)} />)}
      </svg>
      <div dir={direction} style={{position: 'absolute', insetInlineStart: inset, top: Math.max(height * 0.1, safeRect.y)}}>
        <Copy text={text} width={width - inset * 2} height={height * 0.14} size={40} minSize={22} weight={800} direction={direction} role={typeface} maxLines={2} />
      </div>
      <div dir={direction} style={{position: 'absolute', insetInlineEnd: inset, bottom: Math.max(height * 0.08, height - safeRect.y - safeRect.height)}}>
        <Copy text={secondaryText} width={width * 0.6} height={height * 0.08} size={19} minSize={12} weight={400} direction={direction} role={typeface} align="end" verticalAlign="end" color="#726b60" maxLines={2} />
      </div>
    </Canvas>
  );
};

export const WhiteboardExplainer: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const pad = useSafePadding(0.07);
  const draw = interpolate(frame, [8, 54], [1, 0], clamp);
  const copyWidth = pad.innerWidth;
  return (
    <Canvas typeface={typeface} background="#f7f7f3" color="#20252b" style={{padding: pad.css}}>
      <Copy text={text} width={copyWidth} height={height * 0.14} size={Math.max(38, width * 0.044)} minSize={24} weight={800} direction={direction} role={typeface} maxLines={2} />
      <svg viewBox="0 0 800 420" style={{width: '86%', height: '68%', margin: 'auto'}}>
        <path d="M90 290 C170 95 288 98 360 290 C438 82 585 90 704 290" fill="none" stroke={accent} strokeWidth="12" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={draw} />
        <path d="M95 328 H702" fill="none" stroke="#252a31" strokeWidth="7" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={draw} />
        <circle cx="360" cy="290" r="18" fill="#e24b3b" opacity={interpolate(frame, [52, 66], [0, 1], clamp)} />
      </svg>
      <Copy text={secondaryText} width={copyWidth} height={height * 0.07} size={Math.max(17, width * 0.019)} minSize={12} weight={400} direction={direction} role={typeface} align="center" color="#66707a" maxLines={2} />
    </Canvas>
  );
};

export const CameraParallax: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const drift = interpolate(frame, [0, 90], [-1, 1], clamp);
  return (
    <Canvas typeface={typeface} background="#111826" style={{alignItems: 'center', justifyContent: 'center'}}>
      {[0, 1, 2].map((layer) => (
        <div key={layer} style={{position: 'absolute', width: `${92 - layer * 16}%`, height: `${80 - layer * 13}%`, border: `1px solid ${layer === 2 ? accent : '#334057'}`, borderRadius: 28, background: layer === 2 ? '#192338' : `rgba(25,35,56,${0.22 + layer * 0.1})`, translate: `${drift * (layer + 1) * 16}px ${drift * (2 - layer) * -9}px`, scale: 1 + drift * 0.012 * (layer + 1)}} />
      ))}
      <div dir={direction} style={{zIndex: 2, display: 'grid', justifyItems: 'center', gap: 13}}>
        <Copy text={text} width={width * 0.6} height={height * 0.24} size={54} minSize={26} weight={800} direction={direction} role={typeface} align="center" verticalAlign="center" />
        <Copy text={secondaryText} width={width * 0.6} height={56} size={20} minSize={13} weight={400} direction={direction} role={typeface} align="center" color="#aeb9cb" maxLines={2} />
      </div>
    </Canvas>
  );
};

export const CountUpStat: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const number = Math.round(interpolate(frame, [8, 64], [0, 97], {...clamp, easing: Easing.out(Easing.cubic)}));
  const dial = Math.min(width * 0.36, height * 0.56);
  return (
    <Canvas typeface={typeface} style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', width: dial, height: dial, borderRadius: '50%', border: `${Math.max(12, dial * 0.042)}px solid #262d39`}} />
      <svg width={dial + 10} height={dial + 10} viewBox="0 0 440 440" style={{position: 'absolute', rotate: '-90deg'}}>
        <circle cx="220" cy="220" r="190" fill="none" stroke={accent} strokeWidth="18" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - number / 100} />
      </svg>
      <div dir={direction} style={{zIndex: 1, display: 'grid', justifyItems: 'center', gap: dial * 0.02}}>
        {/* The counter is generated (0–97%), never user copy, so it keeps its dial-relative size. */}
        <div style={{fontSize: dial * 0.26, fontWeight: 850, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2}}>{number}%</div>
        <Copy text={text} width={dial * 0.78} height={dial * 0.22} size={dial * 0.065} minSize={12} weight={700} direction={direction} role={typeface} align="center" maxLines={3} />
        <Copy text={secondaryText} width={dial * 0.78} height={dial * 0.12} size={Math.max(15, dial * 0.042)} minSize={11} weight={400} direction={direction} role={typeface} align="center" color="#a8b0bc" maxLines={2} />
      </div>
    </Canvas>
  );
};

export const ShapeMorphTransition: FC<PresetProps> = ({text, accent, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();
  const phase = interpolate(frame, [0, 45, 90], [0, 1, 0], clamp);
  return (
    <Canvas typeface={typeface} background={phase > 0.5 ? accent : '#10131a'} style={{alignItems: 'center', justifyContent: 'center'}}>
      {[0, 1, 2, 3].map((index) => {
        const rotation = frame * (index % 2 ? -1.2 : 1.2) + index * 45;
        return <div key={index} style={{position: 'absolute', width: 190 + index * 40, height: 190 + index * 40, border: `5px solid ${phase > 0.5 ? '#10131a' : accent}`, borderRadius: `${phase * 50}%`, rotate: `${rotation}deg`, scale: 0.72 + phase * 0.28, opacity: 1 - index * 0.16}} />;
      })}
      <div style={{zIndex: 1}}>
        <Copy text={text} width={Math.min(width * 0.6, 520)} height={130} size={47} minSize={20} weight={850} direction={detectDirection(text ?? '')} role={typeface} align="center" verticalAlign="center" color={phase > 0.5 ? '#10131a' : '#f7f4ed'} />
      </div>
    </Canvas>
  );
};

export const IconBurst: FC<PresetProps> = ({text, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const reveal = spring({frame: frame - 6, fps, config: {damping: 16, stiffness: 170}});
  const symbols = ['●', '◆', '✦', '▲', '■', '+'];
  return (
    <Canvas typeface={typeface} style={{alignItems: 'center', justifyContent: 'center'}}>
      {symbols.map((symbol, index) => {
        const angle = (index / symbols.length) * Math.PI * 2;
        return <div key={symbol} style={{position: 'absolute', color: index % 2 ? '#f6f0e5' : accent, fontSize: 36 + (index % 3) * 8, translate: `${Math.cos(angle) * reveal * 250}px ${Math.sin(angle) * reveal * 180}px`, rotate: `${frame * (index % 2 ? -1 : 1)}deg`, opacity: reveal}}>{symbol}</div>;
      })}
      <div style={{scale: reveal}}>
        <Copy text={text} width={width * 0.65} height={height * 0.3} size={62} minSize={26} weight={850} direction={direction} role={typeface} align="center" verticalAlign="center" />
      </div>
    </Canvas>
  );
};

export const SocialPromoPulse: FC<PresetProps> = ({text, secondaryText, accent, direction, typeface = 'display'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {width, height} = usePresetFrame();
  const pad = useSafePadding(0.07);
  const reveal = spring({frame, fps, config: {damping: 20, stiffness: 115}});
  const pulse = 1 + Math.sin(frame / 8) * 0.025;
  const copyWidth = pad.innerWidth;
  return (
    <Canvas typeface={typeface} background="#0d1016" style={{padding: pad.css, justifyContent: 'space-between'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        {/* Fixed brand label: short, Latin, and part of the design rather than user copy. */}
        <div style={{fontSize: Math.max(19, width * 0.022), fontWeight: 800}}>ABUD FUN</div>
        <div style={{width: 12, height: 12, borderRadius: '50%', background: accent, boxShadow: `0 0 20px ${accent}`}} />
      </div>
      <div dir={direction} style={{margin: 'auto 0', opacity: reveal, translate: `0 ${(1 - reveal) * 54}px`, display: 'grid', gap: width * 0.023}}>
        <Copy text={text} width={copyWidth * 0.88} height={height * 0.36} size={Math.max(58, width * 0.071)} minSize={30} weight={850} direction={direction} role={typeface} />
        <Copy text={secondaryText} width={copyWidth * 0.72} height={height * 0.14} size={Math.max(21, width * 0.025)} minSize={14} weight={400} direction={direction} role={typeface} color="#aeb5c2" />
      </div>
      {/* Fixed call-to-action label (design element); its pill keeps the authored size. */}
      <div style={{background: accent, color: '#0b0e13', padding: `${Math.max(16, width * 0.019)}px ${Math.max(24, width * 0.029)}px`, borderRadius: 999, fontSize: Math.max(20, width * 0.023), fontWeight: 800, alignSelf: direction === 'rtl' ? 'flex-end' : 'flex-start', scale: pulse}}>Watch the full story</div>
    </Canvas>
  );
};
