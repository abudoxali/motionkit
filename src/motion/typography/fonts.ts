// Project font manifest. Every face is a local, OFL-1.1 file under public/fonts/ so previews,
// diagnostic stills, and the owner's export render identical glyphs offline on any machine.
// Family names are namespaced ("ABUD …") so a differently versioned system install can never
// silently stand in for the bundled file.

export type FontRole = 'display' | 'text';

export type FontFaceSource = {
  /** Path relative to public/, resolved with staticFile(). */
  file: string;
  /** CSS font-weight descriptor: a single weight or a variable range such as "200 1000". */
  weight: string;
  unicodeRange: string;
};

export type FontFamilyDefinition = {
  role: FontRole;
  family: string;
  label: string;
  upstream: string;
  license: 'OFL-1.1';
  licenseFile: string;
  /** Weights that have been visually verified in the typography QA fixtures. */
  weights: readonly number[];
  faces: readonly FontFaceSource[];
};

// Subset ranges copied from Fontsource 5.3.0 metadata (unicode.json) for the same files.
export const ARABIC_RANGE =
  'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
export const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const plexFaces = ([400, 600, 700] as const).flatMap((weight) => [
  {
    file: `fonts/ibm-plex-sans-arabic/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`,
    weight: String(weight),
    unicodeRange: ARABIC_RANGE,
  },
  {
    file: `fonts/ibm-plex-sans-arabic/ibm-plex-sans-arabic-latin-${weight}-normal.woff2`,
    weight: String(weight),
    unicodeRange: LATIN_RANGE,
  },
]);

export const fontFamilies: readonly FontFamilyDefinition[] = [
  {
    role: 'display',
    family: 'ABUD Cairo',
    label: 'Cairo (display)',
    upstream: 'Cairo Variable 5.3.0 by the Cairo Project Authors, via Fontsource',
    license: 'OFL-1.1',
    licenseFile: 'fonts/cairo/OFL.txt',
    weights: [400, 600, 700, 800, 900],
    faces: [
      {file: 'fonts/cairo/cairo-arabic-wght-normal.woff2', weight: '200 1000', unicodeRange: ARABIC_RANGE},
      {file: 'fonts/cairo/cairo-latin-wght-normal.woff2', weight: '200 1000', unicodeRange: LATIN_RANGE},
    ],
  },
  {
    role: 'text',
    family: 'ABUD Plex Arabic',
    label: 'IBM Plex Sans Arabic (text)',
    upstream: 'IBM Plex Sans Arabic 5.3.0 by IBM Corp., via Fontsource',
    license: 'OFL-1.1',
    licenseFile: 'fonts/ibm-plex-sans-arabic/OFL.txt',
    weights: [400, 600, 700],
    faces: plexFaces,
  },
];

export const getFontFamily = (role: FontRole): FontFamilyDefinition => {
  const family = fontFamilies.find((item) => item.role === role);
  if (!family) throw new Error(`Unknown font role: ${role}`);
  return family;
};

/**
 * CSS font-family value for a role. The other bundled family is the only fallback: no system
 * font is listed, so missing glyphs show up in QA instead of being hidden by Tahoma or Segoe UI.
 */
export const fontStack = (role: FontRole) => {
  const primary = getFontFamily(role).family;
  const secondary = fontFamilies.find((item) => item.role !== role)?.family;
  return secondary ? `"${primary}", "${secondary}"` : `"${primary}"`;
};

/** Nearest verified weight, so callers cannot request a weight a static family does not ship. */
export const resolveWeight = (role: FontRole, requested: number) => {
  const {weights} = getFontFamily(role);
  return weights.reduce((best, weight) =>
    Math.abs(weight - requested) < Math.abs(best - requested) ? weight : best,
  );
};
