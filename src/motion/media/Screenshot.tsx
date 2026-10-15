import type {CSSProperties, FC, ReactNode} from 'react';
import {AbsoluteFill, Img, useCurrentFrame} from 'remotion';
import {useCanvas} from '../core/layout';
import {sequenceScenes} from '../core/timeline';
import {SceneTimeline} from '../scenes/SceneTimeline';
import type {SceneTransition} from '../scenes/layers';
import type {TextDirection} from '../types';
import {deviceLayout, entranceAt, fitRect, imageToScreen, zoomAt, zoomedRect} from './geometry';
import type {DeviceKind, Entrance, FitMode, Point, Rect, ZoomKey} from './geometry';
import type {ImageMetadata} from './manifest';
import {MissingAsset, useRequiredAsset} from './ProjectMedia';

// Real screenshots, presented without changing their content: uniform scaling only, optional
// device framing, zoom/pan toward a focal point, highlight overlays mapped from image coordinates,
// and entrance/exit motion. Everything is a function of the frame.

export type Highlight = {
  /** [x, y, width, height] as fractions of the screenshot (0–1). */
  region: readonly [number, number, number, number];
  from: number;
  /** Frames visible; omitted = until the end. */
  duration?: number;
  /** `box` outlines the region; `spotlight` dims everything else. */
  style?: 'box' | 'spotlight';
  color?: string;
};

export type ScreenshotFrameProps = {
  /** Asset id of an imported image (any image role; screenshots usually). */
  asset: string;
  /** Area on the canvas in composition pixels; defaults to the title-safe area. */
  box?: Rect;
  /** `phone` and `browser` add simple neutral chrome; `card` rounds and shadows; `none` is bare. */
  device?: DeviceKind;
  /** Only for device "none": fill the box (cover, cropped around `focus`) or show all (contain). */
  fit?: FitMode;
  focus?: Point;
  zoom?: readonly ZoomKey[];
  enter?: Entrance;
  exit?: Entrance;
  highlights?: readonly Highlight[];
  shadow?: boolean;
  /** Bezel colour for phone/browser chrome. */
  chrome?: string;
  /** Reading direction, so "slide-start" enters from the reading start. */
  direction?: TextDirection;
  style?: CSSProperties;
};

const HighlightLayer: FC<{image: Rect; highlight: Highlight; frame: number; scale: number}> = ({image, highlight, frame, scale}) => {
  const end = highlight.duration === undefined ? Infinity : highlight.from + highlight.duration;
  if (frame < highlight.from || frame >= end) return null;
  const fadeIn = Math.min(1, (frame - highlight.from) / 10);
  const fadeOut = end === Infinity ? 1 : Math.min(1, (end - frame) / 8);
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
  const rect = imageToScreen(image, highlight.region);
  const color = highlight.color ?? '#ffd447';
  const pad = 6 * scale;
  const common: CSSProperties = {position: 'absolute', left: rect.x - pad, top: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 12 * scale, opacity};
  if (highlight.style === 'spotlight') {
    return <div data-highlight="spotlight" style={{...common, boxShadow: `0 0 0 ${9999}px rgba(4, 8, 16, ${0.58 * opacity})`, outline: `${3 * scale}px solid ${color}`}} />;
  }
  const grow = 0.92 + 0.08 * fadeIn;
  return <div data-highlight="box" style={{...common, border: `${5 * scale}px solid ${color}`, boxShadow: `0 0 ${24 * scale}px ${color}66`, transform: `scale(${grow})`}} />;
};

const Chrome: FC<{kind: DeviceKind; device: Rect; chromeHeight: number; radius: number; color: string; scale: number}> = ({kind, device, chromeHeight, radius, color, scale}) => {
  if (kind === 'browser') {
    const dot = chromeHeight * 0.26;
    return (
      <div style={{position: 'absolute', left: 0, top: 0, width: device.width, height: chromeHeight, background: color, borderTopLeftRadius: radius, borderTopRightRadius: radius, display: 'flex', alignItems: 'center', gap: dot * 0.7, paddingInline: chromeHeight * 0.45, boxSizing: 'border-box', direction: 'ltr'}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((fill) => <span key={fill} style={{width: dot, height: dot, borderRadius: '50%', background: fill, display: 'block'}} />)}
        <span style={{flex: 1, height: chromeHeight * 0.42, marginInlineStart: chromeHeight * 0.4, borderRadius: chromeHeight, background: 'rgba(255,255,255,0.12)', display: 'block'}} />
      </div>
    );
  }
  if (kind === 'phone') {
    return <span style={{position: 'absolute', left: '50%', top: chromeHeight * 0.32, width: device.width * 0.09, height: chromeHeight * 0.36, transform: 'translateX(-50%)', borderRadius: chromeHeight, background: 'rgba(255,255,255,0.10)', display: 'block', minWidth: 8 * scale}} />;
  }
  return null;
};

export const ScreenshotFrame: FC<ScreenshotFrameProps> = ({
  asset,
  box,
  device = 'card',
  fit = 'contain',
  focus = [0.5, 0.5],
  zoom,
  enter,
  exit,
  highlights = [],
  shadow = true,
  chrome = '#15181f',
  direction = 'ltr',
  style,
}) => {
  const frame = useCurrentFrame();
  const canvas = useCanvas();
  const state = useRequiredAsset(asset, {kind: 'image'});
  const area = box ?? canvas.safeRect;
  const unit = canvas.vmin / 10.8; // 1 at 1080 px on the shorter side
  if (state.status === 'loading') return null;
  if (state.status === 'missing') return <div style={{position: 'absolute', left: area.x, top: area.y, width: area.width, height: area.height}}><MissingAsset reason={state.reason} /></div>;

  const meta = state.asset.metadata as ImageMetadata;
  const image = {width: meta.width, height: meta.height};
  const layout = device === 'none'
    ? {device: area, screen: area, radius: 0, screenRadius: 0, chrome: 0}
    : deviceLayout(area, meta.width / meta.height, device);
  const screen = {width: layout.screen.width, height: layout.screen.height};
  const base = device === 'none' ? fitRect(screen, image, fit, focus) : {x: 0, y: 0, ...screen};
  const zoomState = zoomAt(frame, zoom);
  const drawn = zoomedRect(base, screen, zoomState);

  const distance = 60 * unit;
  const flip = direction === 'rtl' ? -1 : 1;
  const into = entranceAt(frame, enter, 'in', distance);
  const out = exit && frame >= exit.frame ? entranceAt(frame, exit, 'out', distance) : {opacity: 1, x: 0, y: 0, scale: 1};
  const opacity = into.opacity * out.opacity;
  const tx = (into.x + out.x) * flip;
  const ty = into.y + out.y;
  const scale = into.scale * out.scale;

  return (
    <div
      data-screenshot={asset}
      style={{
        position: 'absolute',
        left: layout.device.x,
        top: layout.device.y,
        width: layout.device.width,
        height: layout.device.height,
        opacity,
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        borderRadius: layout.radius,
        background: device === 'phone' || device === 'browser' ? chrome : 'transparent',
        boxShadow: shadow && device !== 'none' ? `0 ${30 * unit}px ${80 * unit}px rgba(0,0,0,0.38), 0 ${6 * unit}px ${18 * unit}px rgba(0,0,0,0.22)` : undefined,
        ...style,
      }}
    >
      <Chrome kind={device} device={layout.device} chromeHeight={layout.chrome} radius={layout.radius} color={chrome} scale={unit} />
      <div
        style={{
          position: 'absolute',
          left: layout.screen.x - layout.device.x,
          top: layout.screen.y - layout.device.y,
          width: screen.width,
          height: screen.height,
          overflow: 'hidden',
          borderRadius: device === 'browser' ? `0 0 ${layout.screenRadius}px ${layout.screenRadius}px` : layout.screenRadius,
          // Transparent screenshots keep their transparency; the card shows the canvas through it.
          background: 'transparent',
        }}
      >
        <Img src={state.src} alt="" style={{position: 'absolute', left: drawn.x, top: drawn.y, width: drawn.width, height: drawn.height, maxWidth: 'none'}} />
        {highlights.map((highlight, index) => <HighlightLayer key={index} image={drawn} highlight={highlight} frame={frame} scale={unit} />)}
      </div>
    </div>
  );
};

/** One image asset placed without distortion inside a box (contain or cover). */
export const AssetImage: FC<{asset: string; box?: Rect; fit?: FitMode; focus?: Point; style?: CSSProperties}> = ({asset, box, fit = 'contain', focus, style}) => (
  <ScreenshotFrame asset={asset} box={box} device="none" fit={fit} focus={focus} shadow={false} style={style} />
);

export type ScreenStep = Omit<ScreenshotFrameProps, 'enter' | 'exit'> & {
  id?: string;
  durationInFrames: number;
  /** Overlap with the previous screen; the transition plays here. */
  transitionInFrames?: number;
  /** Extra content over this screen (captions, callouts). */
  overlay?: ReactNode;
};

/**
 * Several screenshots in sequence with simple transitions, built on <SceneTimeline>, so frames,
 * overlaps, and layering follow the same rules as project scenes.
 */
export const ScreenSequence: FC<{screens: readonly ScreenStep[]; transition?: SceneTransition; direction?: TextDirection; background?: ReactNode}> = ({
  screens,
  transition = 'fade',
  direction = 'ltr',
  background,
}) => {
  const scenes = sequenceScenes(screens.map((screen, index) => ({id: screen.id ?? `screen-${index + 1}`, durationInFrames: screen.durationInFrames, transitionInFrames: index === 0 ? 0 : screen.transitionInFrames ?? 0})));
  return (
    <SceneTimeline scenes={scenes} transition={transition} direction={direction}>
      {(_, index) => {
        const {overlay, durationInFrames: _duration, transitionInFrames: _transition, id: _id, ...frame} = screens[index];
        return (
          <AbsoluteFill>
            {background}
            <ScreenshotFrame {...frame} direction={direction} />
            {overlay}
          </AbsoluteFill>
        );
      }}
    </SceneTimeline>
  );
};
