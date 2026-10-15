---
name: arabic-typography
description: Set Arabic and mixed Arabic/English text correctly in MotionKit — bundled Cairo and IBM Plex Sans Arabic fonts, font loading before measurement, RTL and bidi isolation, numerals, diacritics, measured text fitting, safe areas, kinetic words, subtitles, and highlighted phrases. Use this whenever a composition, preset, caption, title, or UI shows Arabic or mixed-script text, when text clips, overflows, falls back to the wrong font, or shows broken letter joins, or when adding a font — even for a single on-screen word.
---

# Arabic typography

Arabic must look designed, not merely rendered. `AGENTS.md` controls; this skill never relaxes its export boundary.

## When to use

Any on-screen text with Arabic, any mixed Arabic/English line, any change to fonts or the typography module, and any report of clipping, wrong order (for example `4MP` instead of `MP4`), or disconnected letters.

## Load only what you need

- [references/arabic.md](references/arabic.md) (Arabic) — the rules learned from real defects: joining, letter-spacing, direction, line height, fonts, numerals, measurement, reading time.
- `src/motion/typography/index.ts` — the public API. Use `graft skeleton src/motion/typography/components.tsx` rather than reading it whole.

## Toolkit (`src/motion/typography`)

| Need | Use |
|---|---|
| Font family for CSS | `fontStack('display' \| 'text')` — Cairo (headings, kinetic) or IBM Plex Sans Arabic (body, captions). Never system fonts. |
| Wait for fonts | `useProjectFontsReady()`; `loadProjectFonts()` already runs from `src/remotion.ts` and holds rendering with `delayRender`. |
| Static text at a token size | `Text`, `Heading`, `BodyText` (`typeLevels`, `typeSize`, `lineHeightFor`). |
| Text that must fit a box | `FittedText` / `ResponsiveTextBlock` / `useFittedText` — measured, whole-word wrapping, glyph overhang reserved; `fitHeight` takes the measured height so stacked copy keeps its rhythm. |
| One size for a stack of single-line words | `useFittedStack(lines, box)` (Kinetic Stack). |
| Word-by-word motion | `KineticWords` (reveal), `Subtitle` (timed highlight from word timings; consecutive opposite-script words are isolated as one run, so "ABUD Motion Studio" keeps its order inside Arabic), `HighlightedPhrase` (marker sweep in reading direction). |
| Voiceover captions | `VoiceoverCaptions` (`src/motion/media`): fitted lines from project timing; word highlighting only on aligned timing; a line with Arabic words in an Arabic narration is RTL even when Latin letters outnumber Arabic ones (`captionDirection`). |
| Mixed scripts | `MixedText` / `segmentScripts` — Latin runs and their digits isolated in `<bdi>`. |
| Direction, numerals, reading time | `detectDirection`, `formatNumerals`, `minimumReadingFrames`, `normalizeArabic` (matching only). |
| Safe areas | `safeAreaFor`, `useSafeBox`. |

## Rules that matter most

1. Split text into words, never letters; animate whole words or mask whole words right-to-left.
2. No `letter-spacing` on Arabic; stretch with kashida or scale the whole word.
3. Measure only after fonts are ready, with the same family stack used to draw.
4. Give Arabic ≥ 1.35 line-height and keep Cairo's tall marks inside the box (`FittedText` does this).
5. Choose Western or Arabic-Indic numerals once per video.
6. A `data-typography-fit="overflow"` result is a content problem: shorten the copy or give it more space; never hide it with `overflow: hidden`.
7. New fonts need a verified redistributable license (OFL or similar) committed next to the files in `public/fonts/`, an entry in `fonts.ts`, and a passing typography QA run.

## Verified bidi behavior (locked by `e2e/typography.spec.ts`)

- In Arabic copy a percent sign follows Arabic order for both numeral systems: `خصم 15%` displays the sign left of the digits, exactly like `٢٠٪` (Unicode W2). Do not "fix" it by reordering characters.
- Latin identifiers keep digits and dots in one run: `MP4`, `H.264`, `4K`.
- Inside Arabic copy, runs of up to three Latin words (`Remotion Studio`, `Focus Doodle`) wrap as one unit (`wrapUnits`).
- Fitted text reserves measured glyph-ink overhang on both sides and Cairo's tall marks above and below.
- Cropping a screenshot exactly at a text box makes edge glyphs look clipped; judge clipping on the whole card or frame.

## Done means

- `npm run qa:typography` passes all nine fixtures (specimens, weights/motion, bidi × 16:9, 9:16, 1:1), and you have looked at the PNGs in `analysis/qa/typography/` for joining, order, marks, and alignment — the audit cannot judge those.
- `npm run test:visual` passes; if the change is intentional, follow the baseline acceptance procedure in the `quality-assurance` skill.
- Typography unit tests pass (`npx vitest run src/tests/typography.test.tsx`).
- Stills of any changed composition show connected Arabic, correct mixed-script order, and nothing clipped.
