---
name: motion-engineering
description: Engineer MotionKit's reusable Remotion foundation — motion core (easing, springs, scene timing, camera, responsive layout, transitions), preset components and catalog, owner-media components and the asset importer, the typed project contract and registry, RemotionRoot registration, and the local Vite library UI. Use this whenever a task changes how animation is built or organised rather than producing one specific video, including refactors, new presets, new primitives, registering a project, Studio wiring, or bundle/performance work, even if the request never says "engine".
---

# Motion engineering

Strengthen the reusable system that every video is built from. `AGENTS.md` controls; its export boundary and determinism rules apply to every change here.

## When to use

- Adding or refactoring code in `src/motion/core/`, `src/motion/components/`, `src/motion/media/`, `scripts/media/`, `src/motion/presets.ts`, `src/projects/contract.ts`, `src/projects/registry.ts`, `src/RemotionRoot.tsx`, or `src/library/`.
- Not for writing a specific video's story (use `abud-creative-director` / `motion-from-reference`) or text layout details (use `arabic-typography`).

## Load only what you need

- [references/remotion.md](references/remotion.md) — determinism rules, the motion-core API table, scenes, camera, commands.
- [references/project-contract.md](references/project-contract.md) — project fields and the five-step registration.
- Code first through Graft (`repo-intelligence` skill): `graft skeleton src/motion/core/timeline.ts`, `graft callers <symbol>` before changing anything shared.

## How to work

1. Prefer what exists: `src/motion/core` for timing/camera/layout, `src/motion/scenes` for multi-scene structure (`<SceneTimeline>`), `src/motion/typography` for text, existing presets before new ones.
2. A helper earns a place in the core only when two or more components need it. Keep project-specific choreography and one-off visual ideas inside the project: the engine exists to make original work easy, not to turn each production into a new preset.
3. Components take typed props, read time only from `useCurrentFrame()`, and lay out from `useCanvas()`/safe areas so 16:9, 9:16, and 1:1 all work.
4. New preset: component in `src/motion/components/presets/` built on `Canvas`, `Copy` (fitted copy with an authored size as the maximum), `useSafePadding`, and `useFittedStack` from `presets/shared.tsx` — no fixed font sizes for user copy. Add a catalog entry in `presets.ts` (props are sanitised there), then add it to `e2e/presets.spec.ts`; it appears automatically in Studio and the library.
5. New project: `npm run project:new -- --id <id>` (see the contract reference); never hand-register project compositions in `RemotionRoot.tsx`.
6. Existing showcase components and `Focus-Doodle-Vertical` are compatibility fixtures: keep them compiling and behaving identically; refactor their imports, never their look.
7. Library controls must be backed by real component props and project data — no placeholder controls. The library previews every format at the native composition size (the Player scales it), exactly as Studio draws it.
8. Owner media: pure logic in `src/motion/media/{manifest,timing,geometry}.ts` (unit-tested), runtime access only through `ProjectMediaProvider`/`useAsset` (manifest and timings load once, under `delayRender` when rendering; missing media shows a labelled card in previews and cancels renders), import and inspection in `scripts/media/`. The manifest is the single source of what a project has; the project's `media` field lists only ids. Never add a second asset registry, cloud storage, or a format that cannot be verified on import and played in Chromium.

## Done means

- `npm run validate` passes, plus `npm run projects:validate` for project changes, `npm run test:e2e` for library or rendering changes, and `npm run qa:typography` if text rendering changed.
- New pure logic has unit tests (determinism, finite values, bounds, invalid input).
- Visual changes are checked in stills or the browser, and the final report says what was and was not observed.
- No full render was run. Follow the `quality-assurance` skill for the checklist.
