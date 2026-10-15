# Remotion rules for this repository

## Every frame is a function of time

- Draw each frame from its frame number only, so Studio, stills, and the owner's export match.
- Forbidden: CSS transitions/animations, `setTimeout`, state that accumulates across frames, `Math.random()`.
- Randomness: `random('seed-' + i)` from `remotion` returns the same value every time.

## Shared motion core (`src/motion/core`)

| Need | Use |
|---|---|
| 0 → 1 over a window | `progress(frame, from, to, ease.snap)` |
| Keyframes with per-segment easing | `track(frame, [[0, 0], [30, 1, ease.overshoot]])` |
| One-off accents / impacts | `bump`, `decay` |
| Named curves | `ease.smooth`, `ease.snap`, `ease.overshoot`, `ease.rise`, `ease.fall`, `ease.crash`, `ease.drift` |
| Springs | `springAt(frame, fps, 'gentle' \| 'snappy' \| 'bouncy' \| 'heavy', delay)` |
| Staggered groups | `stagger(index, step, start)` |
| Scene timeline | `sequenceScenes([{id, durationInFrames, transitionInFrames?}])`, `validateSceneLayout`, `sceneAt`, `soleOwnerWindow`, `sceneProgress`, `transitionProgress`, `timelineDuration` |
| One-world camera | `cameraTrack(frame, {x, y, zoom, rotate?})`, `cameraTransform(camera, w, h)`, `parallax(camera, depth, w, h)`, `worldToScreen` |
| Responsive layout | `useCanvas()` / `canvasMetrics(w, h)` → orientation, `vmin`, safe area; `safePoint(metrics, u, v)`; `inline(value, direction)` |
| Transitions | `fade`, `slideIn(direction)`, `wipe(direction)`, `zoomIn()`, `crossfade(frame, start, end)` |

Only put a helper in the core when at least two components need it. Project-specific choreography stays with the project (see `src/projects/focus-doodle/choreography.ts`).

## Scenes and timing

One rule set (`validateSceneLayout` in `src/motion/core/timeline.ts`) is shared by `sequenceScenes()`, the project contract, and `<SceneTimeline>`:

- Scenes are ordered and the first starts at frame 0. Each scene starts where the previous one ends minus its `transitionInFrames`.
- Overlaps exist only as declared transitions; an undeclared overlap or a gap is an error. A transition is shorter than both scenes and stays out of the previous transition.
- The incoming scene owns overlap frames and draws on top of the fully opaque outgoing scene, so no frame is ever transparent.
- The last scene ends exactly at the timeline duration; review frames sit where a scene is alone on screen.

Render scenes with `src/motion/scenes`:

```tsx
const scenes = sequenceScenes([{id: 'hook', durationInFrames: 60}, {id: 'demo', durationInFrames: 90, transitionInFrames: 12}]);
<SceneTimeline scenes={scenes} transition="slide" direction="rtl">
  {{hook: <Hook />, demo: <Demo />}}
</SceneTimeline>
```

- Transitions: `cut`, `fade`, `slide`, `wipe` (slide and wipe follow reading direction), per scene via a function.
- Inside a scene `useCurrentFrame()` is scene-local; `useScene()` returns `{scene, localFrame, progress, transition, isFirstFrame, isLastFrame}`.
- Missing scene content, an invalid timeline, or `useScene()` outside a scene throw with a clear message.
- `sceneLayersAt(scenes, frame)` is the pure source of what is on screen; test with it rather than rendering.
- For a project, `projectTimeline(meta)` turns contract scenes into a timeline; `defineScenes([...])` computes contract scenes (frames and review frames) from durations and transitions.
- Camera: place `<SceneTimeline>` inside a world container transformed with `cameraTransform`.

- `useCurrentFrame()` inside `<Sequence>` starts at zero for that scene. Pass the scene's `from` if you need the global clock.
- Build project scenes with `defineScenes` (see `project-contract.md`) so metadata, validation, and rendering agree.
- When the story follows narration, take event times from the project's voiceover timing (`npm run voiceover:align` writes `public/user-assets/<id>/timing/<voiceover>.json`; `useVoiceoverTiming`, `captionLines`, `planScenesFromVoiceover`); use literal frame counts only for how long an element takes to move.
- Every `<Sequence>` gets `premountFor` (`<SceneTimeline>` does this for you).

## Camera travel over one world

When scenes connect by camera movement rather than cuts: place every scene in one world container, give each a world position, transform the container with `cameraTransform`, use `<Sequence layout="none">`, and keep both scenes mounted for the whole camera move. Background layers use `parallax` with depth < 1.

## Drawing

- Text: HTML/CSS through the typography components (browser shaping handles Arabic). See the `arabic-typography` skill.
- Lines, shapes, progressive drawing: SVG with `pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k}`.
- Owner images, audio, and video: import with `npm run asset:import` (git-ignored `public/user-assets/<id>/`, manifest with license and source) and use them by id through `src/motion/media` (`ScreenshotFrame`, `AssetImage`, `CharacterSprite`, `LayeredCharacter`, `VoiceoverTrack`, `MusicBed`, `SoundCue`, `VoiceoverCaptions`) inside `<ProjectMediaProvider projectId>`; list the ids in the project's `media` field.

## Audio

- Sound effects sit in a `<Sequence>` that starts at the visual event: `<Html5Audio src={staticFile('sfx/hit.wav')} volume={0.4} />`.
- Check rights before importing any music, voice, or SFX.

## Finishing touches (only if the reference has them)

- Glow: duplicate layer with `filter: blur(8px)` and `mixBlendMode: 'screen'`; avoid large full-frame blurs.
- Grain: SVG `feTurbulence` with a frame-derived `seed`, opacity ≤ 0.08, `mixBlendMode: 'soft-light'`.
- Vignette: radial gradient from transparent to a light black edge.

## Commands (repository root)

| Command | When |
|---|---|
| `npm run studio` | Preview. Port pinned in `src/studio-config.ts`; use `npm run studio -- --port 3100` if it is taken. |
| `npm run stills -- <composition-id> 3 7.5` | Diagnostic PNGs under `analysis/stills/`; allowed any time. |
| `npm run qa:typography` | Typography fixture stills + in-browser audit. |
| `npm run validate` | Tests, typecheck, build. |
| `npm run export -- <composition-id>` | **Owner only, in an interactive terminal after watching the full video. Agents never run it or type its confirmation.** |

## Performance

- Do not draw thousands of elements per frame.
- If Studio is slow, reduce blur and use `will-change: transform` on moving layers.
- Projects register `lazyComponent` loaders, so a heavy production never slows other compositions.
