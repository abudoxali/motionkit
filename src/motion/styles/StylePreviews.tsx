import type {FC} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {fontStack} from '../typography/fonts';
import {useProjectFontsReady} from '../typography/loader';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
// Bundled project fonts; no system fallback.
const FONT = fontStack('display');

export const PlotterStylePreview: FC = () => {
  useProjectFontsReady();
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [8, 72], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: '#101317', color: '#f0ede6', fontFamily: FONT, overflow: 'hidden'}}>
      <AbsoluteFill style={{backgroundImage: 'linear-gradient(#27303a 1px, transparent 1px), linear-gradient(90deg, #27303a 1px, transparent 1px)', backgroundSize: '36px 36px', opacity: 0.65}} />
      <svg viewBox="0 0 900 520" style={{position: 'absolute', inset: '8%', width: '84%', height: '84%'}}>
        <path d="M86 355 C180 80 340 445 445 208 S690 108 816 285" fill="none" stroke="#ff7a2f" strokeWidth="13" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={progress} />
        <circle cx="816" cy="285" r="13" fill="#ff7a2f" style={{filter: 'drop-shadow(0 0 10px #ff7a2f)'}} />
      </svg>
      <div style={{position: 'absolute', left: '8%', top: '12%', fontSize: 46, fontWeight: 850}}>PLOTTER</div>
      <div style={{position: 'absolute', left: '8%', bottom: '12%', color: '#9ba4ad', fontSize: 21}}>Grid · trace · signal</div>
    </AbsoluteFill>
  );
};

export const DoodleStylePreview: FC = () => {
  useProjectFontsReady();
  const frame = useCurrentFrame();
  const walk = interpolate(frame, [0, 120], [-90, 620], clamp);
  const bob = Math.sin(frame / 5) * 8;
  return (
    <AbsoluteFill style={{background: 'linear-gradient(#b6dff0 0 68%, #efd8ad 68%)', fontFamily: FONT, overflow: 'hidden'}}>
      <div style={{position: 'absolute', width: 140, height: 54, borderRadius: '50%', background: '#fff8', left: 90, top: 84}} />
      <div style={{position: 'absolute', left: walk, bottom: 90 + bob, width: 86, height: 118}}>
        <div style={{position: 'absolute', left: 17, top: 0, width: 52, height: 52, border: '6px solid #3a2a1e', borderRadius: '50%', background: '#f1d9ae'}} />
        <div style={{position: 'absolute', left: 9, top: 48, width: 68, height: 70, border: '6px solid #3a2a1e', borderRadius: '38% 38% 24% 24%', background: '#bcdb92', rotate: `${Math.sin(frame / 5) * 3}deg`}} />
      </div>
      <div dir="rtl" style={{position: 'absolute', right: '8%', top: '12%', fontSize: 45, fontWeight: 850, color: '#1e2b45'}}>حكاية تتحرك</div>
      <div style={{position: 'absolute', right: '8%', top: '25%', fontSize: 19, color: '#44516a'}}>one world · one take</div>
    </AbsoluteFill>
  );
};

export const WhiteboardStylePreview: FC = () => {
  useProjectFontsReady();
  const frame = useCurrentFrame();
  const dash = interpolate(frame, [8, 70], [1, 0], clamp);
  return (
    <AbsoluteFill style={{background: '#f6f6f1', color: '#23272e', fontFamily: FONT, overflow: 'hidden'}}>
      <svg viewBox="0 0 900 520" style={{position: 'absolute', inset: '9%', width: '82%', height: '82%'}}>
        <path d="M120 346 C200 122 315 110 394 345 C488 105 638 102 754 346" fill="none" stroke="#1e63d6" strokeWidth="14" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={dash} />
        <path d="M114 384 H760" fill="none" stroke="#23272e" strokeWidth="8" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={dash} />
      </svg>
      <div dir="rtl" style={{position: 'absolute', right: '8%', top: '10%', fontSize: 43, fontWeight: 800}}>ارسم الفكرة</div>
      <div style={{position: 'absolute', right: `${9 + (1 - dash) * 65}%`, bottom: '20%', width: 25, height: 90, background: '#1e63d6', borderRadius: 8, rotate: '18deg', boxShadow: '7px 9px 15px #0002'}} />
    </AbsoluteFill>
  );
};

export const ChalkboardStylePreview: FC = () => {
  useProjectFontsReady();
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [8, 75], [1, 0], clamp);
  const count = Math.round(interpolate(frame, [40, 94], [0, 25], clamp));
  return (
    <AbsoluteFill style={{background: 'radial-gradient(circle at center, #31584a, #17302a)', color: '#f3f1e7', fontFamily: FONT, overflow: 'hidden', border: '18px solid #6c4d31'}}>
      <svg viewBox="0 0 900 520" style={{position: 'absolute', inset: '8%', width: '84%', height: '84%'}}>
        <path d="M148 368 L354 112 L644 368 Z" fill="none" stroke="#f6e07a" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={draw} />
        <path d="M148 368 H644" stroke="#9ad3f0" strokeWidth="9" pathLength="1" strokeDasharray="1" strokeDashoffset={draw} />
      </svg>
      <div style={{position: 'absolute', right: '9%', top: '10%', fontSize: 42, fontWeight: 750}}>a² + b² = c²</div>
      <div style={{position: 'absolute', left: '11%', bottom: '11%', fontSize: 46, color: '#f4a9bc', fontWeight: 800}}>{count}</div>
      <AbsoluteFill style={{opacity: 0.12, backgroundImage: 'repeating-radial-gradient(circle at 30% 20%, #fff 0 1px, transparent 1px 9px)'}} />
    </AbsoluteFill>
  );
};
