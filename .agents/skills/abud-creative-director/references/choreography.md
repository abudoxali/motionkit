# Composition, choreography, camera, and audio

Use this when a scene needs acting, staging, or camera work beyond an entering headline. Working reference implementations: `src/projects/focus-doodle/choreography.ts` (character acting) and `src/projects/mohamy-showcase-oct2026/choreography.ts` (one camera world over real app screenshots).

## From meaning to motion

- Read the narration (or copy) for what each phrase *means* before choosing visuals: a pile-up, a connection, a search, an ordering, a reveal, a boundary. The visual idea comes from that meaning, not from the previous scene's layout.
- Every major movement passes the purpose test: it reveals information, connects two ideas, guides attention, shows change or progress, reinforces the spoken phrase, or lands an intentional emotional beat. Movement that does none of these is cut, however pretty.
- Useful vocabulary (choose, never tick off): camera travel through one world; push-ins and pull-back reveals; mask and iris reveals from a motivated point (a tapped button, a closing boundary); lifting a real crop of a screenshot into a readable close-up; animated diagrams and threads that show relationships; visual metaphors drawn as original 2D shapes; layered depth; match cuts and hand-offs; kinetic words tied to the spoken word.
- Anti-repetition: the same composition for more than two neighbouring beats is a template. Change at least two of shot scale, camera move, composition, and transition between neighbouring beats, and give the strongest idea to the narrative turning point.
- Calm is a choice too: a deliberate hold after a busy passage reads as control. Continuous motion with no rest is noise.
- Use what the engine has first (`cameraTrack`, `progress`/`track`, typography, media geometry). Write project-specific components for the rest; move one into the engine only when a second production clearly needs it.

## Visual hierarchy and composition

- One primary subject per shot. Size, contrast, and motion all point at it; secondary elements stay smaller, slower, or desaturated.
- Vertical 9:16: keep copy in the top safe band (about 110–480 px), the acting subject in the middle third, and floor/props in the lower third. Leave the bottom ~120 px clear for platform UI.
- Vary shot size across a piece: insert close-up → medium → wide reveal → push-in on the decisive object. Repeating one framing for more than ~5 s reads as a slide.
- Separate depth layers: background parallax (0.3–0.4× camera), stage, foreground FX. Screen-space captions sit outside the camera.

## Character acting

- Rig limbs as chains (shoulder → elbow → hand, hip → knee → foot) so arms and legs bend and feet act independently. Plant the lowest foot so crouches lower the pelvis instead of sliding the feet.
- Blend named key poses on a frame track and layer procedural overlays (breathing, toe taps, trembling, writing scribble, walk cycle driven by distance travelled).
- Every big action: anticipation (opposite direction, 6–15 frames) → action (fast, 8–16 frames) → follow-through/overshoot (`Easing.back`) → settle.
- Act through eyes first: eye darts and head whips lead the body by 2–4 frames. Change mouth, brows, and blinks with the emotional beat.
- Make objects react to contact: squash on impact, recoil on hits, wobble when touched.

## Camera language

- Motivate every move: a whip follows a new stimulus, a push-in signals decision or focus, a pull-back reveals consequence, a dutch tilt and shake signal pressure.
- Keyframe camera x, y, zoom, and rotation with per-segment easing. Crash moves use `Easing.out(Easing.exp)`; reveals use in-out curves.
- Impact shakes decay to zero within ~0.5 s. Shake intensity tracks story pressure, never constant noise.
- End on a settled camera: no drift during the final reviewable hold.

## Pacing

- First 2 s: concrete hook shot (often an insert close-up) followed by a crash reveal.
- Escalate by shortening intervals between events, not by adding text.
- Give the turning point a contrast beat — a freeze, silence, or level snap — before the payoff.
- Sync payoffs: the strongest visual change, a camera accent, and the final line should land within a few frames of each other.

## Kinetic typography

- Animate Arabic by whole words; never split or animate individual letters. Use `dir="rtl"`, wrap-safe flex rows, and line height ≥ 1.35.
- Time each word to the action it describes. Accent the key word with color plus a marker drawn right-to-left.
- In-world sound words (e.g. بززز!, طاخ!) belong to the object that makes the sound and leave within ~1 s.

## Optional audio and SFX planning

Audio is optional and owner-directed. When requested, write a cue sheet in `projects/<video>/` with timestamp, cue type (music energy, SFX, narration, intentional silence), source, and rights status. Typical cues: hit on impacts, whoosh on whips and sweeps, a drop to silence on the freeze, a rising swell into the payoff. Use the repository's local `audio:sfx`, `audio:music`, and `audio:align` tools; never import unlicensed assets.
