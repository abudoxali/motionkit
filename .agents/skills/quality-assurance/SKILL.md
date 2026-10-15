---
name: quality-assurance
description: Verify changes in MotionKit before calling them done — choose and run the right gates (Vitest suites, typecheck, Vite build, Playwright library and typography browser tests, visual baselines, typography QA stills, project validation, diagnostic stills), accept new baselines only through the documented procedure, read the evidence honestly, and confirm the owner-only export boundary still holds. Use this at the end of any code, skill, typography, motion, library, or project change, when tests fail, when asked whether something works, or before committing.
---

# Quality assurance

Evidence before claims. `AGENTS.md` controls: verification never includes a full video render.

## When to use

After any change, before a commit, or whenever someone asks whether something works.

## Pick the gates for the change

| Changed | Run |
|---|---|
| Anything | `npm run validate` (Vitest, `tsc --noEmit`, `vite build`) |
| Text, fonts, typography module, presets with text | `npm run qa:typography`, then open the PNGs in `analysis/qa/typography/` |
| Projects, registry, contract | `npm run projects:validate` |
| A composition's look or motion | `npm run stills -- <composition-id> <seconds...>` and inspect the PNGs |
| Library UI | `npm run test:e2e -- --project=library-desktop --project=library-mobile` (1440×900 and 375×812) |
| Typography or preset rendering in a browser | `npm run test:visual` (typography fixtures and all 12 presets: structure + pixels) |
| Scenes or the scaffolder | `npx vitest run src/tests/scenes.test.tsx src/tests/project-new.test.ts src/tests/project-new.render.test.tsx` |
| Skills or agent instructions | `npx vitest run src/tests/agent-policy.test.ts` |
| Owner media (importer, timing, media components) | `npx vitest run src/tests/media.test.ts src/tests/media-import.test.ts src/tests/agent-workflow.test.ts`, then `npx playwright test --project=media`; `ABUD_TEST_ALIGNER=1 npx vitest run src/tests/media-import.test.ts -t "real MMS"` for a real forced-alignment run (Windows speech + cached aligner) |
| Export script or policy | `npx vitest run src/tests/export-policy.test.ts src/tests/manual-export.integration.test.ts` |

Focused runs: `npx vitest run src/tests/<file>`, `npx playwright test e2e/<file> --project=<name>`. Vitest takes seconds; `test:e2e` about a minute (Playwright starts its own Vite server on port 4317 — no Studio or library needs to be running); `qa:typography` about a minute (Remotion bundles and renders nine stills).

## Browser suite (`e2e/`, `playwright.config.ts`)

- `library.spec.ts` runs real workflows twice (desktop, mobile): load, style/preset selection, search and filters, text/accent/typeface/direction edits checked inside the rendered Player, aspect-ratio switching, production navigation, Studio links (pinned to a fake URL), mobile catalog, no horizontal overflow, zero console errors.
- `typography.spec.ts` opens each fixture through `/qa.html?composition=<id>` (dev-only harness that renders the settled frame and publishes `window.__qa`), then checks two things separately:
  1. **Structure** — fonts loaded, audit clean, bidi order (percent signs, `MP4`/`H.264`, numerals, mixed wrapping), continuous highlight marks, and that a failed font load is reported.
  2. **Pixels** — `toHaveScreenshot` against `e2e/baselines/*-win32.png` with a zero-pixel budget.
- `presets.spec.ts` renders each of the 12 presets through `/qa.html?preset=<id>&format=<format>[&props=<JSON>]` at its last (settled) frame: default copy in 16:9, 9:16, and 1:1, long Egyptian Arabic (RTL) and long English (LTR) copy, all inside the canvas and the title-safe area with bundled fonts, plus invalid props (empty copy, unknown typeface/direction/accent, unbreakable words reported as overflow). 16 curated baselines: every preset at 16:9, plus 9:16 for Kinetic Stack, Lower Third Beam, Word Cascade, and Social Promo.
- `styles.spec.ts` renders the 12 style scenes (4 styles × title/explainer/end-card) through `/qa.html?style=<id>&role=<role>&format=<format>[&frame=N][&props=<JSON>]` at native composition sizes: default, long Arabic, long English, and mixed copy fit inside the title-safe area in all three formats; entrance frames render; a frame renders identically twice; everything (except doodle's ambient motion) is still by frame 90, the poster frame the library opens on; a frame sweep (every third frame plus the last, all three formats, one page per scene via `window.__qaSetFrame`) keeps text fitted and on canvas; zero console errors. Structural only — no style-scene baselines are accepted yet.
- `media.spec.ts` renders the `QA-Media-*` fixture (synthetic media imported by `npm run qa:media`, which Playwright's global setup runs when the media is missing and FFmpeg is installed; otherwise the suite skips and says why) in three formats: no missing media, every image drawn at its own aspect ratio, scene boundaries and pose switches, rig nesting, captions following the timing inside the safe area, mixed Arabic/English word captions staying RTL with whole words, an unimported id shown as an explicit missing card, and frame determinism (canonical DOM, not pixels: the GPU blur of large shadows dithers by one level under parallel load).
- The library previews every format at the native composition size; `library.spec.ts` checks the Player's composition size and that every preset's fitted type sizes match the native harness. Still, size components from the canvas, never from absolute pixel floors.
- The harness renders without the library's global CSS, so it shows what Studio and renders draw (that difference once hid a preset layout bug).
- A visual pass means "unchanged since the accepted baseline", never "looks good".

## Accepting new visual baselines

Normal runs never write baselines (`updateSnapshots: 'none'`); a missing or changed image fails. When a typography change is intentional:
1. Run `npm run test:visual` and open the failing diff in `playwright-report/` (or `test-results/`).
2. Confirm the change is the intended one and inspect the new rendering for joining, marks, bidi order, and clipping.
3. Run `npm run test:visual:update` (rewrites only the baselines that differ), look at every rewritten PNG in `e2e/baselines/` (`git status`), and record what changed and why in `STATUS.md` and the commit message.
Baselines are Windows renders; another OS needs its own explicitly generated set.

## What each suite protects (`src/tests/`)

- `project-new.test.ts` — scaffold validation, scene planning, isolated-workspace generation that typechecks and validates, duplicate/invalid/existing-file rejection, and rollback; `project-new.render.test.tsx` renders a generated project at its scene boundaries.
- `scenes.test.tsx` — scene layout rules, layering at every frame, no transparent frames, out-of-order determinism, contract alignment, and `<SceneTimeline>` behavior.
- `typography.test.tsx` — font files and licenses, no system fonts, bidi segmentation, numerals, fitting, overhang, whole-word components.
- `motion-core.test.ts` — curves, springs, frame purity, scene validation, camera, safe areas, transitions, Focus Doodle helper parity.
- `projects.test.ts` — contract validation, registry integrity, Focus Doodle preserved, fixtures in three formats.
- `library.test.tsx` — catalog, projects, configurable Studio URL, format switching, preset/typeface/direction controls, mobile catalog.
- `agent-policy.test.ts` — skill structure and adapters, links, instruction consistency, export rules.
- `media.test.ts` — manifest ids/paths/roles, timing validation, estimates inside speech, caption ordering, scene plans cut in pauses, duration fit, ducking, distortion-free fitting, device framing, zoom, character transforms, poses, rig validation, caption direction.
- `media-import.test.ts` — import of valid image/audio/video/text, unsupported/corrupt/renamed/missing files, duplicates, unsafe paths, unsafe SVG, project ownership, missing FFmpeg, folder import, project-scoped voiceover timing (speech-only, aligned, estimated, required-aligner failure, invalid aligner output, owner-supplied), atomic manifests.
- `agent-workflow.test.ts` — the documented agent workflow in an isolated workspace: create, import, time, wire by id, typecheck, validate.
- `export-policy.test.ts`, `manual-export.integration.test.ts` — the interactive confirmation and non-interactive refusal.
- `focus-doodle.test.ts`, `catalog.test.ts`, `timing.test.ts`, `reference-import.test.ts` — compatibility of existing work.

## Visual review

Use `references/review.md` in `motion-from-reference` for a video. For typography, check: letters joined, marks not clipped, Latin terms and their digits in the right order, punctuation on the correct side, alignment consistent, and no fallback glyphs. A green test run does not prove visual quality.

## Export boundary check

- Never run `npm run export`, `remotion render`, or anything that writes an MP4/MOV; never pipe input into `scripts/manual-export.ts` except through the existing integration test, which proves it refuses.
- Never touch owner media in `out/`, `exports/`, `reference/user/`.

## Done means

Every gate that matches the change ran and passed, visual checks were actually looked at, and the report says honestly what ran and what did not:

State exactly which commands ran and their results (counts, pass/fail), which visual checks you actually looked at, and what was not verified. Failing output is quoted, not summarised away.
