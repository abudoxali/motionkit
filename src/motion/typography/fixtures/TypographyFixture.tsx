import {useEffect, useRef, useState} from 'react';
import type {FC, ReactNode} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, getRemotionEnvironment, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  FittedText,
  HighlightedPhrase,
  KineticWords,
  Subtitle,
  fontStack,
  getFontFamily,
  safeAreaFor,
  useProjectFontsReady,
} from '../index';
import type {FontRole} from '../fonts';
import {auditTypography} from '../qa';
import type {TypographyIssue} from '../qa';
import {bidiSamples, kineticSample, subtitleSample, typographySamples, weightSpecimen} from './samples';
import type {TypographySample} from './samples';

export type TypographyFixtureProps = {
  sheet: 'specimens' | 'motion' | 'bidi';
  /** Cancel the render when the audit finds a defect, so `npm run qa:typography` fails loudly. */
  failOnIssues?: boolean;
};

const INK = '#f5f1e8';
const MUTED = '#8f97a6';
const ACCENT = '#f6c84b';

type Card = {id: string; label: string; role: FontRole; weight: number; audit?: boolean; wide?: boolean; body: (box: {width: number; height: number}) => ReactNode};

/**
 * Audits only the settled last frame: mid-animation frames legitimately have words translated
 * outside their final boxes. Earlier frames release the render immediately and are not judged.
 */
const useAudit = (failOnIssues: boolean, settled: boolean) => {
  const ready = useProjectFontsReady();
  const rootRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  // Only a real render (stills, qa:typography) needs to wait for the audit. Previews skip the
  // handle: React StrictMode runs state initialisers twice, and an orphaned handle would leave
  // window.remotion_renderReady false for the whole library page.
  const [handle] = useState(() => (getRemotionEnvironment().isRendering ? delayRender('Typography QA audit') : null));
  const [issues, setIssues] = useState<TypographyIssue[] | null>(null);
  const released = useRef(false);
  const release = () => {
    if (released.current) return;
    released.current = true;
    if (handle !== null) continueRender(handle);
  };

  useEffect(() => {
    if (!settled) {
      release();
      return;
    }
    if (!ready || issues || !rootRef.current || !safeRef.current) return;
    setIssues(auditTypography(rootRef.current, safeRef.current.getBoundingClientRect()));
  }, [ready, issues, settled]);

  useEffect(() => {
    if (!issues) return;
    console.log(`[typography-qa] ${JSON.stringify({issues})}`);
    if (issues.length > 0 && failOnIssues) {
      cancelRender(new Error(`Typography QA failed: ${issues.map((issue) => `${issue.kind}: ${issue.detail}`).join(' | ')}`));
    }
    release();
  }, [issues, failOnIssues]);

  return {rootRef, safeRef, issues};
};

const specimenCards = (samples: readonly TypographySample[] = typographySamples): Card[] =>
  samples.map((sample) => ({
    id: sample.id,
    label: sample.label,
    role: sample.role,
    weight: sample.weight,
    wide: sample.text.length > 60,
    // Fixtures verify shaping, bidi, and clipping at whatever size the fitter picks; readability
    // floors are covered by the fitText unit tests, so the fixture allows small sizes on 1:1.
    body: (box) => <FittedText text={sample.text} box={box} role={sample.role} weight={sample.weight} level={sample.level} minSize={16} color={INK} />,
  }));

const WeightLadder: FC<{role: FontRole; box: {width: number; height: number}}> = ({role, box}) => {
  const {family, weights} = getFontFamily(role);
  const rowHeight = Math.floor(box.height / weights.length);
  return (
    <>
      {weights.map((weight) => (
        <div key={weight} data-qa-text={`${role}-${weight}`} data-qa-family={family} data-qa-weight={weight} style={{width: box.width, height: rowHeight, overflow: 'hidden'}}>
          <FittedText text={`${weight} · ${weightSpecimen}`} box={{width: box.width, height: rowHeight}} role={role} weight={weight} minSize={12} maxLines={1} color={INK} />
        </div>
      ))}
    </>
  );
};

const motionCards = (frame: number): Card[] => [
  {id: 'display-weights', label: 'Cairo weights', role: 'display', weight: 400, audit: false, body: (box) => <WeightLadder role="display" box={box} />},
  {id: 'text-weights', label: 'IBM Plex Sans Arabic weights', role: 'text', weight: 400, audit: false, body: (box) => <WeightLadder role="text" box={box} />},
  {
    id: 'kinetic',
    wide: true,
    label: 'KineticWords · whole-word reveal',
    role: 'display',
    weight: 800,
    body: (box) => <KineticWords text={kineticSample} box={box} role="display" weight={800} level="heading" color={INK} accent={ACCENT} accentWords={[1]} />,
  },
  {
    id: 'subtitle',
    wide: true,
    label: 'Subtitle · timed word highlight',
    role: 'text',
    weight: 600,
    body: (box) => <Subtitle words={subtitleSample} box={box} role="text" weight={600} level="caption" color={INK} accent={ACCENT} />,
  },
  {
    id: 'highlight',
    wide: true,
    label: 'HighlightedPhrase · RTL marker sweep',
    role: 'display',
    weight: 700,
    body: (box) => (
      <HighlightedPhrase
        text="الفكرة الواضحة تتحرك أمامك"
        highlight={[1, 3]}
        accent="#d45f3f"
        progress={interpolate(frame, [10, 50], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        box={box}
        role="display"
        weight={700}
        level="heading"
        color={INK}
      />
    ),
  },
];

export const TypographyFixture: FC<TypographyFixtureProps> = ({sheet, failOnIssues = true}) => {
  const frame = useCurrentFrame();
  const {width, height, durationInFrames} = useVideoConfig();
  const settled = frame === durationInFrames - 1;
  const {rootRef, safeRef, issues} = useAudit(failOnIssues, settled);
  const safe = safeAreaFor(width, height);
  const cards = sheet === 'specimens' ? specimenCards() : sheet === 'bidi' ? specimenCards(bidiSamples) : motionCards(frame);

  const columns = width >= height ? 2 : 1;
  // Wide cards take a full row; the rest share rows.
  const narrow = cards.filter((card) => !card.wide).length;
  const rows = cards.length - narrow + Math.ceil(narrow / columns);
  const gap = Math.round(Math.min(width, height) * 0.018);
  const labelSize = Math.max(16, Math.round(Math.min(width, height) * 0.017));
  const safeWidth = width - safe.left - safe.right;
  const safeHeight = height - safe.top - safe.bottom;
  const cardWidth = (safeWidth - gap * (columns - 1)) / columns;
  const cardHeight = (safeHeight - gap * (rows - 1)) / rows;
  // Card = padding (2 gaps) + label (1.3 line) + inner gap (0.5) + text box.
  const textHeight = Math.floor(cardHeight - gap * 2.5 - labelSize * 1.3);
  const boxFor = (card: Card) => ({width: Math.floor((card.wide ? safeWidth : cardWidth) - gap * 2), height: textHeight});

  const status = !settled && issues === null ? 'audit runs on the last frame' : issues === null ? 'auditing' : issues.length === 0 ? 'QA pass' : `${issues.length} issue(s)`;

  return (
    <AbsoluteFill ref={rootRef} style={{background: '#0f1218', color: INK}}>
      <div style={{position: 'absolute', top: safe.top * 0.35, left: safe.left, fontFamily: fontStack('text'), fontSize: labelSize, color: issues?.length ? '#ff6b5b' : MUTED}} dir="ltr">
        Typography QA · {sheet} · {width}×{height} · {status}
      </div>
      <div
        ref={safeRef}
        data-qa-safe
        style={{position: 'absolute', top: safe.top, left: safe.left, width: safeWidth, height: safeHeight, display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: cardHeight, gap, outline: `1px dashed #2a3140`}}
      >
        {cards.map((card) => (
          <div key={card.id} style={{gridColumn: card.wide ? '1 / -1' : undefined, background: '#161b24', borderRadius: gap * 0.6, padding: gap, display: 'flex', flexDirection: 'column', gap: gap * 0.5, overflow: 'hidden'}}>
            <div dir="ltr" style={{fontFamily: fontStack('text'), fontSize: labelSize, color: MUTED, lineHeight: 1.3}}>{card.label}</div>
            <div
              data-qa-text={card.audit === false ? undefined : card.id}
              data-qa-family={getFontFamily(card.role).family}
              data-qa-weight={card.weight}
              style={{width: boxFor(card).width, height: textHeight, overflow: 'hidden', flexShrink: 0}}
            >
              {card.body(boxFor(card))}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
