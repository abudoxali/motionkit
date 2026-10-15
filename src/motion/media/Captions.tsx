import type {CSSProperties, FC} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {useCanvas} from '../core/layout';
import {FittedText, Subtitle} from '../typography/components';
import {containsArabic, dominantDirection} from '../typography/script';
import type {TextDirection} from '../types';
import {MissingAsset, useFailRenderWhenMissing, useVoiceoverTiming} from './ProjectMedia';
import {captionAt, captionLines, isWordAccurate} from './timing';

// Captions from a voiceover's project-scoped timing, drawn with the Arabic-safe fitted text
// components: whole words only, RTL/LTR per line, inside the title-safe area. Word highlighting
// runs only on word-accurate timing (forced alignment or owner-supplied); estimated timings show
// whole lines, so a guess is never presented as synchronisation.

export type VoiceoverCaptionsProps = {
  /** Voiceover asset id; its timing comes from npm run voiceover:align. */
  voiceover: string;
  /** Composition frame the voiceover starts (VoiceoverTrack `from`). */
  from?: number;
  mode?: 'sentence' | 'word';
  position?: 'bottom' | 'top' | 'center';
  color?: string;
  accent?: string;
  /** Panel behind the text for legibility over busy footage; 'none' to disable. */
  panel?: string;
  /** Caption block height as a fraction of the safe area height. */
  heightFraction?: number;
  maxLines?: number;
  /** Forces one direction for every line. By default each line decides (see captionDirection). */
  direction?: TextDirection;
  /** Direction when a line has no strong letters. */
  fallbackDirection?: TextDirection;
  style?: CSSProperties;
};

/**
 * Caption line direction. A line with Arabic words in an Arabic narration is RTL even when Latin
 * letters outnumber Arabic ones ("جرّب ABUD Motion Studio دلوقتي"); otherwise the dominant script
 * decides, so a fully English line in an Arabic narration stays LTR.
 */
export const captionDirection = (text: string, language: string | undefined, fallback: TextDirection): TextDirection =>
  containsArabic(text) && /^(ar|ara|arb|arz)([-_]|$)/i.test(language ?? '') ? 'rtl' : dominantDirection(text, fallback);

export const VoiceoverCaptions: FC<VoiceoverCaptionsProps> = ({
  voiceover,
  from = 0,
  mode = 'sentence',
  position = 'bottom',
  color = '#ffffff',
  accent = '#ffd447',
  panel = 'rgba(8, 10, 16, 0.62)',
  heightFraction = 0.2,
  maxLines = 2,
  direction: forcedDirection,
  fallbackDirection = 'rtl',
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const canvas = useCanvas();
  const state = useVoiceoverTiming(voiceover);
  useFailRenderWhenMissing(state);
  const safe = canvas.safeRect;
  const height = Math.round(safe.height * heightFraction);
  const top = position === 'bottom' ? safe.y + safe.height - height : position === 'top' ? safe.y : safe.y + (safe.height - height) / 2;
  const frameStyle: CSSProperties = {position: 'absolute', left: safe.x, top, width: safe.width, height};
  if (state.status === 'loading') return null;
  if (state.status === 'missing') return <div style={frameStyle}><MissingAsset reason={state.reason} style={{fontSize: 18}} /></div>;

  const lines = captionLines(state.timing, fps, {offsetFrames: from});
  const line = captionAt(lines, frame);
  if (!line) return null;
  const direction = forcedDirection ?? captionDirection(line.text, state.timing.language, fallbackDirection);
  const fade = Math.min(1, (frame - line.startFrame) / 5, (line.endFrame - frame) / 5);
  const padX = canvas.vmin * 2.4;
  const padY = canvas.vmin * 1.2;
  const box = {width: safe.width - padX * 2, height: height - padY * 2};
  const wordTimed = mode === 'word' && isWordAccurate(state.timing);
  const shared = {box, direction, color, maxLines, minSize: canvas.vmin * 2.6, maxSize: canvas.vmin * 5.2, align: 'center' as const, verticalAlign: 'center' as const, level: 'body' as const};
  return (
    <div data-caption={line.text} data-caption-mode={wordTimed ? 'word' : 'sentence'} style={{...frameStyle, display: 'flex', alignItems: position === 'top' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end', justifyContent: 'center', opacity: Math.max(0, fade), ...style}}>
      <div style={{padding: `${padY}px ${padX}px`, borderRadius: canvas.vmin * 1.6, background: panel === 'none' ? undefined : panel}}>
        {wordTimed ? <Subtitle {...shared} fitHeight words={line.words} accent={accent} /> : <FittedText {...shared} fitHeight text={line.text} />}
      </div>
    </div>
  );
};
