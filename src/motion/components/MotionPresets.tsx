import {withSanitizedProps} from '../presetProps';
import * as graphics from './presets/graphics';
import * as typography from './presets/typography';

// Public preset components. Implementations live in ./presets/ (typography-led and graphic presets
// share ./presets/shared.tsx); every export validates its props first (see ../presetProps.ts), so
// the catalog, the library, Studio, and direct imports in project code all behave the same.
export const KineticStack = withSanitizedProps(typography.KineticStack);
export const TitleOrbit = withSanitizedProps(typography.TitleOrbit);
export const LowerThirdBeam = withSanitizedProps(typography.LowerThirdBeam);
export const MarkerHighlight = withSanitizedProps(typography.MarkerHighlight);
export const WordCascadeSubtitles = withSanitizedProps(typography.WordCascadeSubtitles);
export const LogoPrismReveal = withSanitizedProps(graphics.LogoPrismReveal);
export const HandDrawnRoute = withSanitizedProps(graphics.HandDrawnRoute);
export const WhiteboardExplainer = withSanitizedProps(graphics.WhiteboardExplainer);
export const CameraParallax = withSanitizedProps(graphics.CameraParallax);
export const CountUpStat = withSanitizedProps(graphics.CountUpStat);
export const ShapeMorphTransition = withSanitizedProps(graphics.ShapeMorphTransition);
export const IconBurst = withSanitizedProps(graphics.IconBurst);
export const SocialPromoPulse = withSanitizedProps(graphics.SocialPromoPulse);
