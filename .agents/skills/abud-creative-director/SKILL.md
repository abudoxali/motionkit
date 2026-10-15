---
name: abud-creative-director
description: Creative direction for product-specific short-form motion videos in MotionKit — product inspection, hooks, story beats, shot and camera plans, pacing, kinetic typography direction, and optional audio cues — written as project specs before implementation. Use this whenever a request involves promoting, launching, demonstrating, or telling the story of a product, app, feature, or idea, or asks for a storyboard, tone, or "make it engaging", even if the word "promo" is never used. Stops at Remotion preview and never renders a final video.
---

# ABUD Creative Director

Turn verified product behavior into a specific, visual Remotion story. `AGENTS.md` remains the controlling safety contract, and `.agents/skills/motion-from-reference/SKILL.md` controls implementation and review.

## When to use

Promo, launch, product-demo, or story-led videos, and any request to decide tone, hook, or storyboard. For a pure style exercise or a revision with no story change, go straight to `motion-from-reference`. Engine work belongs to `motion-engineering`.

## Route the work

1. Inspect the product before writing copy. When the target is a repository, use the `repo-intelligence` skill (`graft map`, a scoped `graft ask --source`, then `graft skeleton`/`graft callers`). Read [product-inspection.md](references/product-inspection.md).
2. Choose or infer a creative direction. Read [creative-directions.md](references/creative-directions.md) when tone is unspecified, custom, or needs translation into concrete design decisions.
3. Write the product truth, hook, actual user workflow, visual identity, scene beats, shot/camera direction, typography behavior, transition logic, and optional audio cues under `projects/<video>/`. Read [storytelling.md](references/storytelling.md).
4. Find one visual idea per beat from what the words mean, then plan composition, camera, pacing, kinetic typography, and optional audio cues. Read [choreography.md](references/choreography.md); it holds the purpose test and the anti-repetition rules.
5. Direct typography in terms the `arabic-typography` toolkit can express (kinetic words, timed subtitles, highlighted phrases, fitted titles) so the plan is buildable.
6. Build from the engine's primitives (motion core, camera, typography, media) and write original, project-specific components in `src/projects/<id>/` whenever the idea needs them. Presets and style scenes are starting points, never the required output.
7. Verify with diagnostic stills of settled and moving frames, and complete Studio playback (`quality-assurance`). Stop with the composition open for owner feedback.

## Done means

`projects/<id>/` holds the product truth, hook, scene beats, shot/camera direction, typography behavior, and optional audio cues; the plan was handed to `motion-from-reference`; and the result stopped at an owner-reviewable Studio preview.

## Creative invariants

- The first two seconds earn attention with a relevant action, contradiction, consequence, or product reveal—not an interchangeable slogan.
- Demonstrate real behavior. Never fabricate features, metrics, reviews, users, outcomes, or UI states. When the owner supplies screenshots, show those screens (framed, zoomed, highlighted) instead of redrawing or inventing UI; when they supply a voiceover, its words and pauses set the beats (import and time it per `motion-from-reference` → `references/media.md`).
- Let tone change pacing, typography, staging, color treatment, camera language, and transitions together.
- Prefer cause-and-effect motion and meaningful transformations over text-only slides or decorative effects.
- Design, don't assemble: no fixed scene count, layout, or device presentation. Neighbouring beats should differ in shot scale, camera, composition, or transition; one framing repeated feature after feature reads as a template.
- Ambition is welcome when it serves the story. Readability and purpose are the limits, not a quota of "light" motion.
- Keep secrets, private data, internal URLs, personal references, and unapproved assets off screen.
- Audio is optional and follows the owner's request. Check rights before importing any track, voice, or SFX.
- Never invoke Hyperframes, `npm run export`, `remotion render`, or any equivalent final-video renderer. Preview and diagnostic PNGs are the terminal deliverable until the owner explicitly takes over export.

This skill adapts creative planning ideas from the MIT-licensed `latent-spaces/brag` project without its Hyperframes or auto-render workflow. See [upstream-attribution.md](references/upstream-attribution.md).
