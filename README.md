<p align="center">
  <img src="public/branding/motionkit-logo.svg" alt="MotionKit Logo" width="320" />
</p>

<p align="center">
  <strong>Direct the idea. Code the motion.</strong><br>
  <em>A local-first, developer-grade motion graphics toolkit powered by Remotion, React, and AI coding agents.</em><br>
  Published by <strong>ABUD FUN</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#key-capabilities">Capabilities</a> •
  <a href="#ai-agent-workflow">AI Agent Workflow</a> •
  <a href="#reusable-motion-presets">Presets</a> •
  <a href="#owner-media-system">Media System</a> •
  <a href="#owner-controlled-export">Export Policy</a> •
  <a href="docs/RELEASE_GUIDE.md">Release Guide</a>
</p>

---

## What is MotionKit?

**MotionKit** is a source-distributed developer tool that transforms how developers and coding agents build programmatic motion graphics. Instead of clicking through complex GUI video editing software or getting trapped in rigid, generic video templates, MotionKit gives you a frame-accurate code foundation built on **Remotion**, **React**, and **TypeScript**.

With MotionKit, you direct the creative vision while coding agents (such as **Claude Code**, **OpenAI Codex**, or **Antigravity**) write, coordinate, and refine real Remotion animation code directly inside your local repository.

- **Zero Cloud Lock-in:** 100% local-first. No accounts, SaaS subscriptions, cloud render queues, or required paid AI APIs. Works completely offline after `npm install`.
- **Creative Freedom:** Presets and styles are composable building blocks, not rigid formats. Build original custom scenes, complex camera movements, and interactive transitions.
- **Engineered Determinism:** Every single frame is mathematically derived from the frame number. No CSS transitions, no accumulated state drift, and no unpredictable animations.
- **World-Class Arabic & Bidi Typography:** Ships with bundled Cairo and IBM Plex Sans Arabic OFL fonts, automated canvas-measured text fitting, script isolation, and safe-area margins.
- **Strict Owner-Controlled Export:** Coding agents can create, preview, and refine animations, but **cannot** render completed MP4 files without your explicit, interactive confirmation.

---

## Quick Start

### 1. Prerequisites
- **Node.js:** v20.0.0 or newer
- **Git**
- **npm** (bundled with Node.js)
- *Optional:* FFmpeg and ffprobe (for importing personal voiceovers, audio inspection, and full media checks)
- *Optional:* Python `uv` (for offline word-level forced audio alignment)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/abudoxali/abud-motion-studio.git
cd abud-motion-studio
npm ci
```

Verify your local environment with the MotionKit doctor:

```bash
npm run doctor
```

### 3. Launching MotionKit

Start both the visual library and Remotion Studio together:

```bash
npm start
```

This launches:
1. **MotionKit Library:** `http://127.0.0.1:4173` — browse styles, motion presets, live aspect-ratio previews, configurable properties, and project assets.
2. **Remotion Studio:** `http://localhost:3000` — frame-accurate timeline scrubbing, composition inspection, audio playback, and visual debugging.

*Tip:* You can also launch services independently:
- Visual Library only: `npm run library`
- Remotion Studio only: `npm run studio:open`

---

## AI Agent Workflow

MotionKit is designed from the ground up to pair seamlessly with filesystem-capable coding agents like **Claude Code**, **OpenAI Codex**, or **Antigravity**.

The repository root contains canonical agent instructions in `AGENTS.md` and specialized modular skills in `.agents/skills/`:
- `abud-creative-director`: Visual hooks, narrative pacing, scene planning, and camera choreography.
- `motion-from-reference`: Style extraction, visual matching, and reference analysis.
- `motion-engineering`: Core timeline architecture, transitions, presets, and project contracts.
- `arabic-typography`: Font loading, bidirectional text isolation, and text fitting.
- `quality-assurance`: Vitest test suites, Playwright browser tests, visual baselines, and safety checks.

### Ready-to-Copy Agent Prompt Example

Start Claude Code or Codex in this folder and paste a creative brief:

```markdown
Create a 30-second vertical motion reel (1080x1920) for our mobile productivity app.
- Style: doodle with clean technical lines.
- Voiceover: import from "C:\Assets\voiceover.mp3" with transcript "C:\Assets\script.txt".
- Visuals: use screenshots from "C:\Assets\screens\" in device frames with smooth camera focus moves.
- Typography: use the bundled Cairo font for energetic Arabic headlines; ensure all lines stay inside safe-area boundaries.
- Timing: align camera moves and feature highlights to the natural spoken voiceover cues.
- Do NOT export video; leave the composition ready for review in Remotion Studio.
```

The agent will scaffold the project, import and time your media, write the custom Remotion composition, run automated validation, and notify you when the preview is ready in Studio.

---

## Reusable Motion Presets

MotionKit includes 12 production-grade, mathematically fitted Remotion presets in `src/motion/components/presets/`:

| Preset | Category | Core Purpose |
|---|---|---|
| **Kinetic Stack** | Typography | High-energy headline hierarchy with word staggering |
| **Title Orbit** | Typography | Dynamic chapter headers with orbital framing rings |
| **Lower Third Beam** | Typography | Speaker introduction and metadata lower thirds |
| **Prism Reveal** | Brand | Geometric refractive logo and brand reveals |
| **Marker Highlight** | Typography | Right-to-left safe highlighter stroke under key phrases |
| **Word Cascade** | Typography | Word-by-word kinetic subtitle cascades |
| **Hand-drawn Route** | Drawing | Illustrated journey maps with animated path tracers |
| **Whiteboard Explainer** | Drawing | Step-by-step diagrammatic explainers with feathered reveals |
| **Camera Parallax** | Camera | 2.5D multi-plane depth motion with camera velocity |
| **Count-up Stat** | Data | Precision numerical counters with radial progress arcs |
| **Shape Morph** | Transitions | Fluid geometric scene transitions and color inversions |
| **Social Promo Pulse** | Social | High-impact promotional calls to action and end cards |

Every preset automatically adapts to **16:9** (Horizontal), **9:16** (Vertical), and **1:1** (Square) aspect ratios.

---

## Arabic & Bidirectional Typography

Arabic kinetic typography is notoriously difficult in traditional video tools. MotionKit solves this completely at the engine level:

- **Bundled OFL Fonts:** Ships with `Cairo` (variable display) and `IBM Plex Sans Arabic` (text/captions) in `public/fonts/`. No missing system font fallbacks.
- **Intact Arabic Words:** Strictly forbids splitting Arabic words into letters or applying letter-spacing that breaks cursive glyph shaping.
- **Measured Text Fitting:** `FittedText` and `ResponsiveTextBlock` measure text on-canvas, calculate Cairo's mark overhang, wrap on whole words, and dynamically scale down long copy to fit within title-safe areas.
- **Bidirectional Isolation:** Opposite-script phrases (e.g. English technical terms, "4K", "MP4", or percentages like "15%") inside Arabic sentences are isolated and never flipped out of order.

---

## Owner Media System

Import and utilize your own voiceovers, app screenshots, character illustrations, and sound effects:

```bash
# 1. Scaffold a new project
npm run project:new -- --id my-feature --title "Feature Launch" --language ar --format vertical --style doodle

# 2. Import voiceover audio
npm run asset:import -- --project my-feature --file "C:\Assets\voiceover.mp3" --role voiceover

# 3. Align voiceover timing to transcript
npm run voiceover:align -- --project my-feature --script "C:\Assets\script.txt"

# 4. Import app screenshots or brand assets
npm run asset:import -- --project my-feature --dir "C:\Assets\screens"

# 5. Inspect project assets
npm run asset:list -- --project my-feature
```

### Media Components

- `<ScreenshotFrame>`: Contain/cover screenshots with focal points, browser/phone chrome, pan-and-zoom spotlights, and entrance transitions.
- `<VoiceoverTrack>` & `<VoiceoverCaptions>`: Word-highlighted captions synchronized with millisecond accuracy to spoken audio.
- `<MusicBed>` & `<SoundCue>`: Background music that automatically ducks volume under voiceover speech.
- `<CharacterSprite>` & `<LayeredCharacter>`: 2D articulated illustrated characters with pivot points and pose sequences.

---

## Owner-Controlled Export Policy

To prevent costly mistakes, token waste, or accidental leaks, **coding agents are strictly prohibited from rendering final videos.**

When you have reviewed the composition in Remotion Studio and are ready to create an MP4, run the interactive manual export command yourself:

```bash
npm run export -- <composition-id>
```

This gate:
1. Verifies interactive TTY terminal execution (rejects piped, script, or CI calls).
2. Displays the exact composition details and duration.
3. Requires typed confirmation: `EXPORT <composition-id>`.
4. Executes the Remotion renderer and writes the finished video to the local, git-ignored `exports/` folder.

---

## Command Reference

| Command | Purpose |
|---|---|
| `npm start` | Launch both MotionKit Library and Remotion Studio together |
| `npm run library` | Start local MotionKit visual library (`http://127.0.0.1:4173`) |
| `npm run studio` | Start Remotion Studio in background (`http://localhost:3000`) |
| `npm run studio:open` | Start Remotion Studio and open system browser |
| `npm run doctor` | Run dependency, port, and environment readiness diagnostics |
| `npm run validate` | Run Vitest unit tests, TypeScript check, and Vite production build |
| `npm run projects:validate`| Verify all registered projects against the typed contract |
| `npm run project:new -- --id <id>` | Scaffold a new motion project safely |
| `npm run asset:import` | Import and verify audio, images, or video assets |
| `npm run asset:list` | List imported project media and timing status |
| `npm run voiceover:align` | Run forced audio alignment or speech-pause detection |
| `npm run test:e2e` | Run complete Playwright browser regression test suite |
| `npm run qa:typography` | Render diagnostic stills of all typography QA sheets |
| `npm run export -- <id>` | Interactive owner-only final MP4 video export |
| `npm run release:package` | Package clean source distribution archive with SHA-256 |

---

## Architecture Overview

```text
├── .agents/skills/            # Multi-agent specialized skills (motion, director, typography, QA)
├── analysis/                  # Ignored diagnostic stills and reference analyses
├── e2e/                       # Playwright test specs and reviewed platform baselines
├── exports/                   # Ignored finished video exports (owner-only)
├── projects/<id>/             # Per-project creative specs: SCRIPT.md, STYLE.md, SCENES.md
├── public/
│   ├── branding/              # MotionKit logo, mark, and social banners
│   ├── fonts/                 # Bundled OFL Cairo & IBM Plex Sans Arabic fonts
│   └── user-assets/<id>/      # Ignored imported owner media and timing manifests
├── scripts/                   # CLI tools: doctor, start, asset, export, project:new, release
├── src/
│   ├── library/               # MotionKit visual workspace UI (Vite + React)
│   ├── motion/
│   │   ├── core/              # Frame-pure animation, easing, camera, transitions
│   │   ├── components/        # 12 reusable motion presets & visual primitives
│   │   ├── media/             # Media runtime (screenshots, characters, captions, audio)
│   │   ├── scenes/            # SceneTimeline and transition layering
│   │   ├── styles/            # Preserved style directions (plotter, doodle, whiteboard, chalkboard)
│   │   └── typography/        # Bundled font loader, bidi isolation, and text fitting
│   ├── projects/              # Typed project contract, registry, and scaffolding
│   ├── RemotionRoot.tsx       # Studio composition registration
│   └── remotion.ts            # Remotion entry point
└── STATUS.md                  # Single project-wide milestone and release record
```

---

## License & Attribution

- **License:** MIT License. See [LICENSE](LICENSE) for full details.
- **Third-Party Notices:** See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for licenses of bundled OFL fonts (Cairo, IBM Plex Sans Arabic) and upstream acknowledgments.
- **Developer Credit:** Published and maintained by **ABUD FUN**.
