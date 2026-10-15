---
name: motion-from-reference
description: Create or revise a specific Remotion motion-graphics video in MotionKit from one of the four library styles, a user-owned reference video, and the owner's own media (ElevenLabs or other voiceovers, transcripts, app screenshots, character art, logos, music), in Arabic or English, and stop at an interactive Studio preview for the owner. Use this whenever the owner asks for a new video, reel, explainer, product presentation, animated post, or revisions to an existing composition — including "اعمل فيديو", "عدّل المشهد", "استخدم التعليق الصوتي ده", style matching, reference analysis, word-timed captions, or audio cues — even if they do not name a style.
---

# Motion from reference

Production workflow for Codex, Claude Code, Antigravity, and compatible agents. `AGENTS.md` controls, above all its owner-only export boundary. For promo or story-led work, plan with `abud-creative-director` first.

## When to use

A request that ends in a reviewable composition. Engine-only changes belong to `motion-engineering`; text-only fixes to `arabic-typography`.

## 0. Inspect and prepare

- Work from the repository root. Read the chosen `styles/<id>/README.md` and only the references below that the task needs.
- Find existing code with Graft (`repo-intelligence`) instead of reading directories.
- Verify Node, ffmpeg, and uv only for the steps that need them. Install packages with `npm install`.
- Touch `reference/user/` only when the owner asks to import or analyze a file there.

## 1. Select and understand direction

- Library style: use its documentation and original code preview (`Style-<id>` in Studio).
- Personal reference: `npm run reference:import -- <path> --name <name>`, then `npm run reference:analyze -- <video> --out analysis/<name>`; apply [references/style-bible.md](references/style-bible.md).
- Learn visual grammar only. Never reproduce protected content, logos, characters, voice, or branding.

## 2. Resolve inputs once

Ask only for what is missing, in one round ([references/questions.md](references/questions.md)): topic, the one idea to remember, audience/platform, duration, language/direction, format, assets, voiceover, music, SFX. First read what the owner already supplied (files, transcript, `npm run asset:list`) and do not ask for it again. Suggest defaults. If voiceover was requested but not supplied, prepare the script and stop for the owner's audio file.

## 3. Script, scenes, and timing

- Fill in the scaffolded `projects/<id>/SCRIPT.md`, `STYLE.md`, `SCENES.md`.
- Owner files (voiceover, transcript, screenshots, characters, logos, music): import and time them per [references/media.md](references/media.md) — `asset:import`, `asset:list`, `voiceover:align`. A supplied voiceover sets the duration and the scene cuts; its timing is project-scoped (`public/user-assets/<id>/timing/`), never a shared file.
- No voiceover: on-screen reading timing via `align.py --wps` ([references/audio.md](references/audio.md)), written to a project file.
- Tie scene events to spoken or on-screen timing; literal frame counts only describe how an element moves.

## 4. Build

- Build from the motion core, camera, typography, and media components; read the `motion-engineering` skill's `references/remotion.md` for the API table and determinism rules. Presets (`src/motion/presets.ts`) and style scenes are starting points, not the required output: write project-specific components in `src/projects/<id>/` whenever the story needs an idea they cannot express.
- All text goes through `src/motion/typography` (bundled fonts, fitted boxes, whole-word motion); follow the `arabic-typography` skill.
- Owner media goes through `src/motion/media` by asset id (`ScreenshotFrame`, `CharacterSprite`, `LayeredCharacter`, `VoiceoverTrack`, `VoiceoverCaptions`, `MusicBed`, `SoundCue`); never hard-code paths or redraw supplied screens.
- Start the project with `npm run project:new -- --id <id> --format <formats> --language <ar|en|ar-en>` (try `--dry-run` first); it creates the docs, typed definition, component, and registry entry. Details: `motion-engineering` → `references/project-contract.md`.
- Every scene needs an intentional visual event, a readable hold, and a motivated transition — not a slide sequence, and not one layout repeated per feature (`abud-creative-director` → `references/choreography.md`).

## 5. Verify without final rendering

- `npm run validate`, `npm run projects:validate` (also checks imported media, timing, and voiceover fit), and `npm run qa:typography` when text changed.
- `npm run stills -- <composition-id> <seconds...>` at every scene and important word, including frames in the middle of transitions and camera moves; run the checklist in [references/review.md](references/review.md).
- Follow the `quality-assurance` skill for what to report.

## 6. Preview and iterate

- `npm run studio` (or `-- --port 3100` if 3000 is taken); tell the owner the composition id and timestamps to review.
- Keep Studio running, apply notes, repeat tests and stills.
- Set the project stage to `review-ready` at most; only the owner marks `owner-accepted`.

## Done means

The composition is registered, validated, inspected in stills, and open in Studio for the owner — and nothing was exported.

## Owner-only export

The owner may run `npm run export -- <composition-id>` in a real interactive terminal after watching the complete animation. It requires a typed composition-specific phrase and writes to ignored `exports/`. Agents never run or automate it.
