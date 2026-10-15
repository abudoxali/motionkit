import type {CSSProperties, FC, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  BOX,
  bubbleAt,
  bubbleSpecs,
  bump,
  CHARACTER_SCALE,
  cameraAt,
  characterAt,
  checkFlightAt,
  GROUND,
  NOTEBOOK,
  notebookAt,
  phoneAt,
  plantAt,
  POT,
  pressureAt,
  progress,
  TABLE,
  boxAt,
  vignetteAt,
  type Camera,
  type CharacterState,
  type Mood,
} from './choreography';
import {focusDoodleProject} from './timeline';

const INK = '#3A2A1E';
const SKY = '#AFDCF0';
const PAPER = '#F7EDDA';
const SAND = '#F1D9AE';
const LEAF = '#BCDB92';
const ORANGE = '#F07F2E';
const BLUE = '#5576D9';
const YELLOW = '#FFE58F';
const FONT = "'Segoe UI', 'Noto Sans Arabic', Tahoma, Arial, sans-serif";
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const worldSvg: CSSProperties = {position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, overflow: 'visible'};

/* ------------------------------------------------------------------ kinetic Arabic captions */

type CaptionWord = {text: string; at: number; accent?: boolean};

// Words animate as whole glyph runs so Arabic joining is never broken.
const KineticCaption: FC<{
  eyebrow: string;
  accent: string;
  words: readonly CaptionWord[];
  enter: number;
  exit: number;
  size?: number;
  tremble?: readonly [number, number];
}> = ({eyebrow, accent, words, enter, exit, size = 70, tremble}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const arrive = spring({frame: frame - enter, fps, config: {damping: 16, stiffness: 140, mass: 0.8}});
  const leave = progress(frame, exit, exit + 9, Easing.in(Easing.cubic));
  const shake = tremble ? progress(frame, tremble[0], tremble[1]) : 0;

  return (
    <div
      dir="rtl"
      style={{
        position: 'absolute',
        top: 112,
        left: 70,
        right: 70,
        minHeight: 230,
        padding: '30px 44px 34px',
        border: `6px solid ${INK}`,
        borderRadius: '42px 34px 48px 32px',
        background: 'rgba(255,250,239,0.95)',
        boxShadow: `13px 15px 0 ${INK}24`,
        fontFamily: FONT,
        color: INK,
        translate: `${shake * Math.sin(frame * 1.4) * 3}px ${(1 - arrive) * -90 - leave * 70}px`,
        rotate: `${(1 - arrive) * -3 + shake * Math.sin(frame * 0.9) * 0.6}deg`,
        opacity: Math.min(1, arrive * 1.5) * (1 - leave),
        zIndex: 40,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8}}>
        <span style={{width: 54 * arrive, height: 12, borderRadius: 99, background: accent, rotate: '-3deg'}} />
        <span style={{fontSize: 28, fontWeight: 800, color: accent}}>{eyebrow}</span>
      </div>
      <div style={{display: 'flex', flexWrap: 'wrap', columnGap: '0.28em', fontSize: size, fontWeight: 850, lineHeight: 1.42}}>
        {words.map((word, index) => {
          const pop = spring({frame: frame - word.at, fps, config: {damping: 12, stiffness: 190, mass: 0.7}});
          const marker = progress(frame, word.at + 5, word.at + 15, Easing.out(Easing.cubic));
          const jitter = shake * Math.sin(frame * 1.3 + index * 2.1) * 2.5;
          return (
            <span
              key={`${word.text}-${index}`}
              style={{
                position: 'relative',
                display: 'inline-block',
                color: word.accent ? accent : INK,
                opacity: Math.min(1, pop * 1.6),
                translate: `0 ${(1 - pop) * 46}px`,
                scale: 0.55 + 0.45 * pop,
                rotate: `${(1 - pop) * (index % 2 === 0 ? -9 : 9) + jitter}deg`,
              }}
            >
              {word.accent ? (
                <span
                  style={{
                    position: 'absolute',
                    left: -8,
                    right: -8,
                    bottom: '0.22em',
                    height: '0.3em',
                    borderRadius: 12,
                    background: `${accent}38`,
                    scale: `${marker} 1`,
                    transformOrigin: 'right center',
                    zIndex: -1,
                  }}
                />
              ) : null}
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const FinalTitle: FC<{start: number}> = ({start}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stamp = spring({frame: frame - start, fps, config: {damping: 9, stiffness: 160, mass: 0.9}});
  const second = spring({frame: frame - start - 10, fps, config: {damping: 13, stiffness: 150}});
  const underline = progress(frame, start + 14, start + 30, Easing.out(Easing.cubic));
  const marker = progress(frame, start + 4, start + 16, Easing.out(Easing.cubic));

  return (
    <div
      dir="rtl"
      style={{
        position: 'absolute',
        top: 118,
        left: 64,
        right: 64,
        padding: '30px 40px 38px',
        border: `7px solid ${INK}`,
        borderRadius: '46px 36px 52px 34px',
        background: 'rgba(255,250,239,0.97)',
        boxShadow: `15px 17px 0 ${INK}26`,
        fontFamily: FONT,
        color: INK,
        textAlign: 'center',
        opacity: Math.min(1, stamp * 2),
        scale: 0.4 + 0.6 * stamp,
        rotate: `${(1 - stamp) * -8 - 1.2}deg`,
        zIndex: 45,
      }}
    >
      <div style={{position: 'relative', display: 'inline-block', fontSize: 104, fontWeight: 900, lineHeight: 1.36}}>
        <span
          style={{
            position: 'absolute',
            left: -18,
            right: -18,
            bottom: 18,
            height: 46,
            borderRadius: 18,
            background: YELLOW,
            scale: `${marker} 1`,
            transformOrigin: 'right center',
            zIndex: -1,
          }}
        />
        ركّز في الأهم
      </div>
      <div
        style={{
          position: 'relative',
          fontSize: 62,
          fontWeight: 850,
          lineHeight: 1.45,
          color: '#4E9B67',
          opacity: second,
          translate: `0 ${(1 - second) * 30}px`,
        }}
      >
        وهتلاقي الفرق
        <svg viewBox="0 0 400 30" style={{display: 'block', width: 400, height: 30, margin: '-4px auto 0'}}>
          <path d="M392 14 Q300 2 200 16 Q100 28 8 12" fill="none" stroke={ORANGE} strokeWidth="9" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - underline} />
        </svg>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ articulated character */

const THIGH = 52;
const SHIN = 50;
const HIP_Y = 418;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

const Leg: FC<{hip: number; knee: number; foot: number}> = ({hip, knee, foot}) => (
  <g transform={`rotate(${hip})`}>
    <path d={`M0 0 Q4 ${THIGH / 2} 0 ${THIGH}`} strokeWidth="17" />
    <g transform={`translate(0 ${THIGH}) rotate(${-knee})`}>
      <path d={`M0 0 Q-4 ${SHIN / 2} 0 ${SHIN}`} strokeWidth="17" />
      {/* Counter-rotate the foot so it stays flat unless the pose asks for toe/heel action. */}
      <g transform={`translate(0 ${SHIN}) rotate(${-(hip - knee) + foot} 10 4)`}>
        <path d="M12 4 Q-8 -9 -33 5" strokeWidth="17" />
      </g>
    </g>
  </g>
);

const Arm: FC<{shoulder: number; elbow: number; children?: ReactNode}> = ({shoulder, elbow, children}) => (
  <g transform={`rotate(${shoulder})`}>
    <path d="M0 0 Q-7 31 0 62" strokeWidth="19" />
    <g transform={`translate(0 62) rotate(${elbow})`}>
      <path d="M0 0 Q-5 28 0 56" strokeWidth="18" />
      {children}
      <circle cx="0" cy="60" r="15" fill={SAND} strokeWidth="8" />
    </g>
  </g>
);

const mouths: Record<Mood, string> = {
  calm: 'M152 166 Q178 177 204 165',
  startled: '',
  worried: 'M150 173 Q178 157 206 173',
  overwhelmed: 'M147 176 Q160 160 178 172 Q194 184 208 168',
  deciding: 'M152 167 Q178 161 204 165',
  focused: 'M151 164 Q178 170 204 162',
  proud: 'M146 158 Q178 198 210 156 Q178 170 146 158Z',
};

const brows: Record<Mood, {inner: number; raise: number}> = {
  calm: {inner: 0, raise: 0},
  startled: {inner: -6, raise: -13},
  worried: {inner: -10, raise: -2},
  overwhelmed: {inner: -14, raise: -4},
  deciding: {inner: 8, raise: 0},
  focused: {inner: 5, raise: 0},
  proud: {inner: -2, raise: -5},
};

const Character: FC<{frame: number; state: CharacterState}> = ({frame, state}) => {
  const {pose: p, mood, blink, breath, x, pencilInHand} = state;
  const leftReach = THIGH * Math.cos(rad(p.lHip)) + SHIN * Math.cos(rad(p.lHip - p.lKnee));
  const rightReach = THIGH * Math.cos(rad(p.rHip)) + SHIN * Math.cos(rad(p.rHip - p.rKnee));
  // The lowest foot is planted; the pelvis drops whenever both knees bend.
  const footY = HIP_Y + Math.max(leftReach, rightReach) + 8;
  const squashX = 1 + p.squash * 0.55;
  const squashY = 1 - p.squash;
  const fx = p.facing * 14;
  const brow = brows[mood];
  const eyeScale = 1 - blink;
  const startled = mood === 'startled' || p.gasp > 0.55;
  const sweat = mood === 'worried' || mood === 'overwhelmed';
  const sweatY = (frame * 2.2) % 64;
  const shadow = 1 - Math.min(1, p.lift / 260);

  return (
    <svg viewBox="0 0 1080 1920" style={worldSvg} aria-label="شخصية مرسومة باليد">
      <ellipse cx={x} cy={GROUND + 6} rx={150 * shadow} ry={20 * shadow} fill={INK} opacity={0.12} />
      <g
        transform={`translate(${x} ${GROUND - p.lift}) scale(${CHARACTER_SCALE}) scale(${squashX} ${squashY}) translate(-180 ${-footY})`}
        fill="none"
        stroke={INK}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g transform={`translate(140 ${HIP_Y})`}>
          <Leg hip={p.lHip} knee={p.lKnee} foot={p.lFoot} />
        </g>
        <g transform={`translate(216 ${HIP_Y}) scale(-1 1)`}>
          <Leg hip={p.rHip} knee={p.rKnee} foot={p.rFoot} />
        </g>

        <g transform={`rotate(${p.lean} 178 422) translate(178 422) scale(${1 - breath * 0.4} ${1 + breath}) translate(-178 -422)`}>
          <path d="M111 274 Q177 244 243 278 L238 423 Q178 448 112 421 Z" fill={LEAF} strokeWidth="10" />
          <path d="M133 278 Q178 312 220 278" strokeWidth="8" opacity="0.5" />

          <g transform={`rotate(${p.head} 178 236)`}>
            <path d="M117 90 Q177 25 244 92 Q260 124 245 180 Q228 222 177 224 Q121 222 105 177 Q90 125 117 90Z" fill={SAND} strokeWidth="10" />
            <path
              transform={`translate(${p.facing * 6} 0)`}
              d="M112 99 Q139 33 204 48 Q246 54 252 103 Q217 82 193 94 Q150 111 112 99Z"
              fill={INK}
              strokeWidth="8"
            />
            <g transform={`translate(${fx} ${p.lookY * 0.4})`}>
              <path d={`M132 ${118 + brow.raise} Q148 ${110 + brow.raise} 164 ${118 + brow.raise + brow.inner}`} strokeWidth="8" />
              <path d={`M192 ${118 + brow.raise + brow.inner} Q208 ${110 + brow.raise} 226 ${118 + brow.raise}`} strokeWidth="8" />
              {startled ? (
                <>
                  <circle cx="150" cy="143" r="20" fill="#fff" strokeWidth="6" />
                  <circle cx="211" cy="143" r="20" fill="#fff" strokeWidth="6" />
                </>
              ) : null}
              {eyeScale > 0.25 ? (
                <>
                  <ellipse cx={150 + p.lookX * 0.8} cy={142 + p.lookY * 0.6} rx={startled ? 7 : 10} ry={(startled ? 8 : 13) * eyeScale} fill={INK} strokeWidth="0" />
                  <ellipse cx={211 + p.lookX * 0.8} cy={142 + p.lookY * 0.6} rx={startled ? 7 : 10} ry={(startled ? 8 : 13) * eyeScale} fill={INK} strokeWidth="0" />
                </>
              ) : (
                <>
                  <path d="M138 145 Q150 152 162 145" strokeWidth="7" />
                  <path d="M199 145 Q211 152 223 145" strokeWidth="7" />
                </>
              )}
              {startled || p.gasp > 0.55 ? (
                <ellipse cx="178" cy="172" rx={11 + p.gasp * 4} ry={13 + p.gasp * 7} fill={INK} strokeWidth="0" />
              ) : (
                <path d={mouths[mood]} strokeWidth="8" fill={mood === 'proud' ? INK : 'none'} />
              )}
              {mood === 'proud' || mood === 'focused' ? (
                <>
                  <circle cx="132" cy="174" r="11" fill="#F6A5B8" strokeWidth="0" opacity="0.55" />
                  <circle cx="226" cy="174" r="11" fill="#F6A5B8" strokeWidth="0" opacity="0.55" />
                </>
              ) : null}
            </g>
            {sweat ? (
              <path
                transform={`translate(0 ${sweatY})`}
                d="M259 112 Q284 140 258 160 Q240 139 259 112Z"
                fill={SKY}
                strokeWidth="6"
                opacity={1 - sweatY / 64}
              />
            ) : null}
            {mood === 'overwhelmed' ? (
              <path
                transform={`rotate(${frame * 9} 178 0)`}
                d="M138 4 C150 -40 214 -40 208 -4 C202 26 150 26 160 -10 C170 -42 232 -30 216 6"
                strokeWidth="7"
                opacity="0.8"
              />
            ) : null}
          </g>

          <g transform="translate(114 290)">
            <Arm shoulder={p.lSh} elbow={p.lEl} />
          </g>
          <g transform="translate(242 290) scale(-1 1)">
            <Arm shoulder={p.rSh} elbow={p.rEl}>
              {pencilInHand ? (
                <g transform="translate(0 58) rotate(-38)">
                  <path d="M0 -12 L0 50" stroke={ORANGE} strokeWidth="13" />
                  <path d="M-7 50 L0 68 L7 50 Z" fill={INK} strokeWidth="3" />
                </g>
              ) : null}
            </Arm>
          </g>
        </g>
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ props & set */

const NotificationBubble: FC<{
  x: number;
  y: number;
  color: string;
  label: string;
  icon: string;
  scale: number;
  rotate: number;
  opacity: number;
  gray: number;
}> = ({x, y, color, label, icon, scale, rotate, opacity, gray}) => (
  <div
    dir="rtl"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      height: 96,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      whiteSpace: 'nowrap',
      background: color,
      border: `7px solid ${INK}`,
      borderRadius: '34px 27px 38px 25px',
      boxShadow: `9px 11px 0 ${INK}22`,
      color: INK,
      fontFamily: FONT,
      fontWeight: 850,
      fontSize: 30,
      translate: '-50% -50%',
      scale,
      rotate: `${rotate}deg`,
      opacity,
      filter: gray > 0.01 ? `grayscale(${gray})` : undefined,
    }}
  >
    <span style={{fontSize: 36}}>{icon}</span>
    <span>{label}</span>
  </div>
);

const Phone: FC<{frame: number}> = ({frame}) => {
  const phone = phoneAt(frame);
  if (!phone.visible) return null;
  const flash = phone.buzzing ? 0.55 + Math.sin(frame * 0.42) * 0.25 : 0.3;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: phone.x,
          top: phone.y,
          width: 165,
          height: 290,
          background: INK,
          border: `8px solid ${INK}`,
          borderRadius: 36,
          translate: '-50% -50%',
          rotate: `${phone.rotate}deg`,
          scale: phone.scale,
          boxShadow: '15px 20px 0 rgba(58,42,30,0.14)',
        }}
      >
        <div style={{position: 'absolute', inset: 12, borderRadius: 24, background: SKY, overflow: 'hidden'}}>
          <div style={{height: 22, width: 62, borderRadius: 20, background: INK, margin: '11px auto'}} />
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              style={{
                width: 106,
                height: 36,
                borderRadius: 14,
                margin: '17px auto',
                background: row === 1 ? ORANGE : '#fff9',
                border: `4px solid ${INK}`,
                opacity: row === 1 ? flash : 0.7,
              }}
            />
          ))}
        </div>
      </div>
      {phone.buzzing ? (
        <svg viewBox="0 0 1080 1920" style={worldSvg}>
          {[0, 1].map((ring) => {
            const pulse = ((frame + ring * 9) % 18) / 18;
            return (
              <g key={ring} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" opacity={(1 - pulse) * 0.7}>
                <path d={`M${phone.x - 108 - pulse * 30} ${phone.y - 60} Q${phone.x - 128 - pulse * 36} ${phone.y} ${phone.x - 108 - pulse * 30} ${phone.y + 60}`} />
                <path d={`M${phone.x + 108 + pulse * 30} ${phone.y - 60} Q${phone.x + 128 + pulse * 36} ${phone.y} ${phone.x + 108 + pulse * 30} ${phone.y + 60}`} />
              </g>
            );
          })}
        </svg>
      ) : null}
    </>
  );
};

const Notebook: FC<{frame: number}> = ({frame}) => {
  const book = notebookAt(frame);
  return (
    <div
      style={{
        position: 'absolute',
        left: NOTEBOOK.x,
        top: NOTEBOOK.y,
        width: NOTEBOOK.width,
        height: NOTEBOOK.height,
        border: `9px solid ${INK}`,
        borderRadius: '23px 37px 27px 30px',
        background: '#FFF9E8',
        rotate: '-4deg',
        scale: 1 + book.pop,
        transformOrigin: '50% 100%',
        boxShadow: `0 0 ${80 * book.glow}px ${30 * book.glow}px rgba(255,225,85,.55), 12px 15px 0 rgba(58,42,30,.12)`,
      }}
    >
      <div style={{position: 'absolute', left: -18, top: 26, bottom: 26, width: 34, borderRadius: 20, background: BLUE, border: `7px solid ${INK}`}} />
      {[0, 1, 2].map((line) => (
        <div
          key={line}
          style={{
            position: 'absolute',
            right: 28,
            top: 44 + line * 52,
            width: (215 - line * 26) * Math.min(1, Math.max(0, book.lines * 3 - line)),
            height: 8,
            borderRadius: 20,
            background: INK,
            opacity: 0.32,
          }}
        />
      ))}
      <svg viewBox="0 0 300 220" style={{position: 'absolute', inset: 0}}>
        <path d="M66 112 L108 152 L226 56" fill="none" stroke={ORANGE} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - book.check} />
      </svg>
    </div>
  );
};

const RoomSet: FC<{frame: number}> = ({frame}) => {
  const calm = progress(frame, 560, 660);
  return (
    <svg viewBox="0 0 1080 1920" style={worldSvg}>
      <rect x="-700" y={GROUND} width="2480" height="900" fill={interpolateColors(calm, [0, 1], ['#E9CC9C', '#E6DDB0'])} />
      <path d={`M-700 ${GROUND} Q200 ${GROUND - 8} 540 ${GROUND + 3} T1780 ${GROUND}`} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      {[80, 290, 640, 930].map((dash, index) => (
        <path key={dash} d={`M${dash} ${GROUND + 70 + (index % 2) * 60} q40 -8 80 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" opacity="0.25" />
      ))}
      <rect x={TABLE.left + 42} y={TABLE.top + 40} width="26" height={GROUND - TABLE.top - 40} rx="12" fill={INK} transform={`rotate(2 ${TABLE.left + 55} ${TABLE.top})`} />
      <rect x={TABLE.right - 70} y={TABLE.top + 40} width="26" height={GROUND - TABLE.top - 40} rx="12" fill={INK} transform={`rotate(-2 ${TABLE.right - 57} ${TABLE.top})`} />
      <rect
        x={TABLE.left}
        y={TABLE.top}
        width={TABLE.right - TABLE.left}
        height="52"
        rx="22"
        fill={interpolateColors(calm, [0, 1], [ORANGE, LEAF])}
        stroke={INK}
        strokeWidth="9"
        transform={`rotate(${interpolate(calm, [0, 1], [-1.2, 0], clamp)} ${(TABLE.left + TABLE.right) / 2} ${TABLE.top})`}
      />
    </svg>
  );
};

const TablePencil: FC<{frame: number; inHand: boolean}> = ({frame, inHand}) => {
  if (inHand) return null;
  const later = frame >= 806;
  const x = later ? 640 : 590;
  return (
    <svg viewBox="0 0 1080 1920" style={worldSvg}>
      <g transform={`translate(${x} ${TABLE.top - 9}) rotate(${later ? 6 : -4})`} strokeLinecap="round">
        <path d="M0 0 L92 0" stroke={ORANGE} strokeWidth="14" />
        <path d="M92 -7 L110 0 L92 7 Z" fill={INK} stroke={INK} strokeWidth="3" />
      </g>
    </svg>
  );
};

const Box: FC<{frame: number; part: 'back' | 'front'}> = ({frame, part}) => {
  const box = boxAt(frame);
  if (!box.visible) return null;
  const width = BOX.right - BOX.left;
  const height = GROUND - BOX.top;
  const cx = (BOX.left + BOX.right) / 2;
  const transform = `translate(0 ${box.drop}) translate(${cx} ${GROUND}) scale(${1 + box.squash * 0.6} ${1 - box.squash}) translate(${-cx} ${-GROUND})`;

  if (part === 'back') {
    return (
      <svg viewBox="0 0 1080 1920" style={worldSvg}>
        <g transform={transform}>
          <rect x={BOX.left + 8} y={BOX.top - 16} width={width - 16} height="40" rx="12" fill={INK} opacity="0.85" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 1080 1920" style={worldSvg}>
      <g transform={transform} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d={`M${BOX.left} ${BOX.top} L${BOX.right} ${BOX.top} L${BOX.right - 8} ${GROUND} L${BOX.left + 8} ${GROUND} Z`} fill={SKY} strokeWidth="9" />
        <path d={`M${BOX.left + 40} ${BOX.top + 58} q60 -12 120 0`} fill="none" strokeWidth="7" opacity="0.5" />
        <g transform={`rotate(${box.lid} ${BOX.right + 8} ${BOX.top})`}>
          <rect x={BOX.left - 12} y={BOX.top - 30} width={width + 20} height="34" rx="16" fill={ORANGE} strokeWidth="8" />
        </g>
      </g>
    </svg>
  );
};

const Plant: FC<{frame: number}> = ({frame}) => {
  const plant = plantAt(frame);
  if (frame < 756) return null;
  const top = POT.y - 330;
  return (
    <svg viewBox="0 0 1080 1920" style={worldSvg}>
      <g transform={`rotate(${plant.sway} ${POT.x} ${POT.y - 60})`} stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        <path
          d={`M${POT.x} ${POT.y - 64} C${POT.x - 22} ${POT.y - 140} ${POT.x + 30} ${POT.y - 210} ${POT.x + 4} ${POT.y - 270} C${POT.x - 4} ${POT.y - 300} ${POT.x + 6} ${top + 20} ${POT.x + 8} ${top}`}
          fill="none"
          strokeWidth="13"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - plant.stem}
        />
        <path d={`M${POT.x - 4} ${POT.y - 150} Q${POT.x - 74} ${POT.y - 170} ${POT.x - 92} ${POT.y - 228} Q${POT.x - 22} ${POT.y - 232} ${POT.x - 4} ${POT.y - 174}`} fill={LEAF} strokeWidth="9" style={{scale: Math.max(0, plant.leaves), transformOrigin: `${POT.x - 4}px ${POT.y - 150}px`}} />
        <path d={`M${POT.x + 8} ${POT.y - 220} Q${POT.x + 76} ${POT.y - 236} ${POT.x + 96} ${POT.y - 296} Q${POT.x + 24} ${POT.y - 298} ${POT.x + 8} ${POT.y - 246}`} fill={LEAF} strokeWidth="9" style={{scale: Math.max(0, plant.leaves), transformOrigin: `${POT.x + 8}px ${POT.y - 220}px`}} />
        <g style={{scale: plant.bloom, transformOrigin: `${POT.x + 8}px ${top}px`}}>
          {[0, 60, 120, 180, 240, 300].map((rotation) => (
            <ellipse key={rotation} cx={POT.x + 8} cy={top - 40} rx="24" ry="44" fill={YELLOW} strokeWidth="8" style={{rotate: `${rotation + frame * 0.15}deg`, transformOrigin: `${POT.x + 8}px ${top}px`}} />
          ))}
          <circle cx={POT.x + 8} cy={top} r="30" fill={ORANGE} strokeWidth="8" />
        </g>
      </g>
      <g style={{scale: plant.pot, transformOrigin: `${POT.x}px ${POT.y}px`}} stroke={INK} strokeLinejoin="round">
        <path d={`M${POT.x - 70} ${POT.y - 70} Q${POT.x} ${POT.y - 92} ${POT.x + 70} ${POT.y - 70} L${POT.x + 54} ${POT.y} H${POT.x - 54} Z`} fill={BLUE} strokeWidth="9" />
      </g>
    </svg>
  );
};

const FlyingChecks: FC<{frame: number}> = ({frame}) => (
  <svg viewBox="0 0 1080 1920" style={worldSvg}>
    {[0, 1, 2].map((index) => {
      const check = checkFlightAt(index, frame);
      if (!check.visible) return null;
      return (
        <g key={index} transform={`translate(${check.x} ${check.y}) scale(${check.scale})`}>
          <circle r="34" fill={index === 2 ? YELLOW : LEAF} stroke={INK} strokeWidth="8" />
          <path d="M-18 -1 l13 13 l27 -31" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    })}
  </svg>
);

const CallLines: FC<{frame: number}> = ({frame}) => {
  const fade = 1 - progress(frame, 226, 250);
  const pressure = frame < 456 ? pressureAt(frame) : 0;
  return (
    <svg viewBox="0 0 1080 1920" style={worldSvg}>
      {fade > 0
        ? [0, 1, 2].map((index) => {
            const bubble = bubbleAt(index, frame);
            return (
              <path
                key={index}
                d={`M${bubble.x} ${bubble.y + 40} Q${(bubble.x + 360) / 2} ${Math.min(bubble.y, 1000) - 60} 360 1000`}
                fill="none"
                stroke={INK}
                strokeWidth="7"
                strokeDasharray="16 16"
                strokeLinecap="round"
                strokeDashoffset={-frame * 2}
                opacity={Math.min(1, bubble.scale) * fade * 0.6}
              />
            );
          })
        : null}
      {pressure > 0
        ? [0, 1, 2].map((ring) => (
            <ellipse
              key={ring}
              cx="370"
              cy="1060"
              rx={300 + ring * 90 - pressure * 40}
              ry={250 + ring * 70 - pressure * 30}
              fill="none"
              stroke={ring === 1 ? ORANGE : INK}
              strokeWidth={8 - ring}
              strokeDasharray={`${18 + ring * 8} ${22 + ring * 6}`}
              strokeDashoffset={-frame * (3 + ring)}
              strokeLinecap="round"
              opacity={pressure * (0.5 - ring * 0.1)}
              transform={`rotate(${frame * (0.6 + ring * 0.3)} 370 1060)`}
            />
          ))
        : null}
      {(() => {
        const ring = progress(frame, 636, 668, Easing.out(Easing.cubic));
        const fadeOut = 1 - progress(frame, 760, 800);
        if (ring <= 0 || fadeOut <= 0) return null;
        return (
          <ellipse
            cx={NOTEBOOK.x + NOTEBOOK.width / 2}
            cy={NOTEBOOK.y + NOTEBOOK.height / 2}
            rx="235"
            ry="175"
            fill="none"
            stroke={ORANGE}
            strokeWidth="9"
            strokeDasharray="22 18"
            strokeLinecap="round"
            pathLength="400"
            strokeDashoffset={400 * (1 - ring)}
            opacity={0.75 * fadeOut}
          />
        );
      })()}
    </svg>
  );
};

/* ------------------------------------------------------------------ in-world kinetic sound words */

const SoundWord: FC<{frame: number; text: string; at: number; until: number; x: number; y: number; size: number; color: string; tilt: number}> = ({
  frame,
  text,
  at,
  until,
  x,
  y,
  size,
  color,
  tilt,
}) => {
  if (frame < at || frame > until + 10) return null;
  const pop = spring({frame: frame - at, fps: 30, config: {damping: 9, stiffness: 220}});
  const out = progress(frame, until, until + 10);
  return (
    <div
      dir="rtl"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        translate: '-50% -50%',
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.4,
        color,
        WebkitTextStroke: `${Math.round(size / 14)}px ${INK}`,
        paintOrder: 'stroke fill',
        whiteSpace: 'nowrap',
        scale: pop * (1 - out * 0.4),
        rotate: `${tilt + Math.sin(frame * 0.9) * 2}deg`,
        opacity: 1 - out,
      }}
    >
      {text}
    </div>
  );
};

const SleepyZs: FC<{frame: number}> = ({frame}) => (
  <>
    {[0, 1, 2].map((index) => {
      const start = 700 + index * 22;
      if (frame < start) return null;
      const t = ((frame - start) % 66) / 66;
      return (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: BOX.right - 30 + Math.sin(t * Math.PI * 2) * 16 + index * 8,
            top: BOX.top - 40 - t * 150,
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 34 + index * 10,
            color: INK,
            opacity: bump(t, 0, 1) * 0.75,
          }}
        >
          z
        </div>
      );
    })}
  </>
);

/* ------------------------------------------------------------------ stage, camera and frame chrome */

const Stage: FC<{frame: number}> = ({frame}) => {
  const character = characterAt(frame);
  return (
    <>
      <RoomSet frame={frame} />
      <Notebook frame={frame} />
      <TablePencil frame={frame} inHand={character.pencilInHand} />
      <Phone frame={frame} />
      <Plant frame={frame} />
      <Character frame={frame} state={character} />
      <CallLines frame={frame} />
      <Box frame={frame} part="back" />
      {bubbleSpecs.map((spec, index) => {
        if (frame < spec.appear) return null;
        const bubble = bubbleAt(index, frame);
        if (bubble.opacity <= 0.01) return null;
        return <NotificationBubble key={spec.label} {...bubble} color={spec.color} label={spec.label} icon={spec.icon} />;
      })}
      <Box frame={frame} part="front" />
      <FlyingChecks frame={frame} />
      <SleepyZs frame={frame} />
      <SoundWord frame={frame} text="بززز!" at={4} until={44} x={760} y={1020} size={92} color={YELLOW} tilt={-10} />
      <SoundWord frame={frame} text="!!" at={30} until={58} x={250} y={930} size={84} color={ORANGE} tilt={-12} />
      <SoundWord frame={frame} text="طاخ!" at={552} until={590} x={760} y={1340} size={96} color={ORANGE} tilt={8} />
    </>
  );
};

const worldTransform = (camera: Camera, depth = 1): CSSProperties => {
  const zoom = 1 + (camera.zoom - 1) * depth;
  const x = 540 + (camera.x - 540) * depth;
  const y = 960 + (camera.y - 960) * depth;
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1080,
    height: 1920,
    transformOrigin: '0 0',
    transform: `translate(540px, 960px) rotate(${camera.rotate * depth}deg) scale(${zoom}) translate(${-x}px, ${-y}px)`,
  };
};

const Backdrop: FC<{frame: number; camera: Camera}> = ({frame, camera}) => {
  const calm = progress(frame, 760, 860);
  const sunX = interpolate(frame, [0, 450, 899], [880, 830, 190], clamp);
  const sunY = interpolate(frame, [0, 450, 899], [520, 560, 600], clamp);
  return (
    <div style={worldTransform(camera, 0.35)}>
      <svg viewBox="0 0 1080 1920" style={worldSvg}>
        <g opacity={calm} stroke={YELLOW} strokeWidth="12" strokeLinecap="round" transform={`rotate(${frame * 0.12} ${sunX + 85} ${sunY + 85})`}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path key={angle} d={`M${sunX + 85} ${sunY - 40} L${sunX + 85} ${sunY - 90}`} transform={`rotate(${angle} ${sunX + 85} ${sunY + 85})`} />
          ))}
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          left: sunX,
          top: sunY,
          width: 170,
          height: 170,
          borderRadius: '50%',
          background: YELLOW,
          border: `9px solid ${INK}`,
          boxShadow: `0 0 ${55 * calm}px rgba(255,229,143,.75)`,
          opacity: 0.8,
        }}
      />
      <div style={{position: 'absolute', left: 64 + Math.sin(frame / 60) * 20, top: 470, width: 250, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,.58)', border: `6px solid ${INK}`, rotate: '-3deg', opacity: 0.72}} />
      <div style={{position: 'absolute', right: 35 - Math.sin(frame / 70) * 24, top: 760, width: 230, height: 66, borderRadius: '50%', background: 'rgba(255,255,255,.48)', border: `6px solid ${INK}`, rotate: '4deg', opacity: 0.6}} />
    </div>
  );
};

const PaperTexture = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        'radial-gradient(circle at 18% 22%, rgba(58,42,30,.11) 0 2px, transparent 2.6px), radial-gradient(circle at 78% 58%, rgba(58,42,30,.08) 0 1.6px, transparent 2.2px)',
      backgroundSize: '84px 84px, 58px 58px',
      opacity: 0.3,
      mixBlendMode: 'multiply',
      pointerEvents: 'none',
    }}
  />
);

const TimelineTrail: FC = () => {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [0, 899], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', left: 86, right: 86, bottom: 78, height: 24, zIndex: 50}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 99, background: 'rgba(58,42,30,.16)'}} />
      <div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: `${width * 100}%`, borderRadius: 99, background: ORANGE}} />
      {[0, 1, 2, 3].map((dot) => (
        <div
          key={dot}
          style={{
            position: 'absolute',
            right: `${dot * 33.333}%`,
            top: -10,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: frame >= dot * 225 ? ORANGE : PAPER,
            border: `6px solid ${INK}`,
            translate: '50% 0',
          }}
        />
      ))}
    </div>
  );
};

const [beatOne, beatTwo, beatThree, beatFour] = focusDoodleProject.beats;

export const FocusDoodleVertical: FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const camera = cameraAt(frame);
  const background = interpolateColors(frame, [0, 330, 450, 520, 899], [SKY, '#D7C8E9', '#CDBFDD', '#F3DFC0', '#DCE9B8']);
  const vignette = vignetteAt(frame);

  return (
    <AbsoluteFill style={{background, overflow: 'hidden', fontFamily: FONT}}>
      <Backdrop frame={frame} camera={camera} />
      <div style={worldTransform(camera)}>
        <Stage frame={frame} />
      </div>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 60%, transparent 40%, rgba(58,42,30,${vignette}) 100%)`,
          pointerEvents: 'none',
        }}
      />

      <Sequence name="Beat 1 - Overwhelmed" from={beatOne.from} durationInFrames={beatOne.durationInFrames} premountFor={fps}>
        <KineticCaption
          eyebrow="١ · الدوشة"
          accent={ORANGE}
          enter={40}
          exit={216}
          words={[
            {text: 'كل', at: 42},
            {text: 'حاجة', at: 48},
            {text: 'بتنادي', at: 54, accent: true},
            {text: 'عليك...', at: 62},
          ]}
        />
      </Sequence>
      <Sequence name="Beat 2 - Accumulation" from={beatTwo.from} durationInFrames={beatTwo.durationInFrames} premountFor={fps}>
        <KineticCaption
          eyebrow="٢ · التراكم"
          accent="#D95F86"
          enter={0}
          exit={216}
          size={66}
          tremble={[115, 215]}
          words={[
            {text: 'فتبدأ', at: 14},
            {text: 'دي...', at: 20, accent: true},
            {text: 'وتسيب', at: 58},
            {text: 'دي...', at: 64, accent: true},
            {text: 'وتنسى', at: 100},
            {text: 'دي', at: 108, accent: true},
          ]}
        />
      </Sequence>
      <Sequence name="Beat 3 - Decision" from={beatThree.from} durationInFrames={beatThree.durationInFrames} premountFor={fps}>
        <KineticCaption
          eyebrow="٣ · الاختيار"
          accent={BLUE}
          enter={8}
          exit={216}
          words={[
            {text: 'اختار', at: 20},
            {text: 'حاجة', at: 27},
            {text: 'واحدة...', at: 34, accent: true},
            {text: 'واديها', at: 150},
            {text: 'تركيزك', at: 160, accent: true},
          ]}
        />
      </Sequence>
      <Sequence name="Beat 4 - Resolution" from={beatFour.from} durationInFrames={beatFour.durationInFrames} premountFor={fps}>
        <KineticCaption
          eyebrow="٤ · النتيجة"
          accent="#4E9B67"
          enter={2}
          exit={156}
          words={[
            {text: 'الدوشة', at: 8},
            {text: 'بتهدى...', at: 16},
            {text: 'والشغل', at: 44},
            {text: 'بيكمّل', at: 52, accent: true},
          ]}
        />
        <FinalTitle start={162} />
      </Sequence>

      <PaperTexture />
      <TimelineTrail />
    </AbsoluteFill>
  );
};
