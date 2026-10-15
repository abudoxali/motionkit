# Motion style library

Each style folder contains its visual rules, a machine-readable `style.json`, and upstream notes retained for attribution and deeper implementation guidance. Playable previews are original React/Remotion components in `src/motion/styles/` and appear in both the local library and Remotion Studio.

| ID | Direction | Preview composition |
|---|---|---|
| `plotter` | Technical signal on a measured dark grid | `Style-plotter` |
| `doodle` | Illustrated one-take narrative world | `Style-doodle` |
| `whiteboard` | Marker-built step-by-step explanation | `Style-whiteboard` |
| `chalkboard` | Textured visual proof on a green board | `Style-chalkboard` |

To add a style, create `styles/<id>/README.md` and `style.json`, build an original code preview, register it in `src/motion/styles/index.ts`, and add a test expectation. User reference videos remain under ignored `reference/user/`.

## Reusable style scenes

`src/motion/styles/templates.tsx` gives each of the four styles three reusable scene roles — `title`, `explainer`, `end-card` — as editable Remotion components (`<StyleScene styleId role text secondaryText direction accent>`), **not** exported videos. Each style keeps its own drawing grammar, motion, and arrangement:

| Style | Title | Explainer | End card | Text motion |
|---|---|---|---|---|
| Plotter | rising signal traced by a tracer dot, peak measured; text beside it | plotted series whose points count in as the tracer reaches them | signal locks onto a reticle | words land decisively |
| Doodle | character walks in and waves by a signpost; captions at the top | character carries an idea along a trail toward a house | character cheers by a planted flag | bouncy pop |
| Whiteboard | marker draws a mind map | three steps joined by arrows (stacked in tall frames), each counting its dots | a box is drawn and checked | written on under a feathered edge |
| Chalkboard | right triangle, sides in counted colours, right angle marked | 1 + 3 + 5 = 3² dot proof built in groups | conclusion boxed in chalk with a tombstone | chalk comes into focus |

Layout comes from `styleSceneLayout(style, role, width, height, direction)`, a pure, unit-tested function: text and drawing stay inside the title-safe area, text sits on the reading-start side, and type sizes are fractions of the canvas, so the library's 960×540 16:9 preview is an exact half-scale of the 1920×1080 composition. Without an explicit `direction`, the scene follows the dominant script of the headline (Arabic copy that opens with a Latin name stays RTL). Every entrance has finished by frame 90 (`STYLE_SCENE_SETTLED_FRAME`).

In the local library, select a style and switch **Preview scene** from the original style study to any role; the paused Player opens on the settled frame. Edit the scene headline and supporting text to see your own copy. Original style previews remain available.

`npm run project:new -- --id explainer-reel --style whiteboard --language ar --format vertical --dry-run` shows the planned files. Without `--dry-run`, the generated composition places that style's title, explainer, and end-card scenes on `<SceneTimeline>` (`styleSceneRoleFor`). Omit `--style` (or pass `custom`) to keep the neutral scaffold. Never export automatically; only the owner performs manual export.

Verification: `src/tests/style-templates.test.ts` (layout invariants, sizing, direction, scaffold output), the `project-new` tests (all four styles generated, type-checked, validated, rendered), and `e2e/styles.spec.ts` (all 12 roles in three formats with real fonts). No style-scene pixel baselines are accepted yet; their appearance awaits owner review.
