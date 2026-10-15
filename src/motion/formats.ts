export const compositionFormats = {
  horizontal: {width: 1920, height: 1080},
  vertical: {width: 1080, height: 1920},
  square: {width: 1080, height: 1080},
} as const;

export type CompositionFormat = keyof typeof compositionFormats;
