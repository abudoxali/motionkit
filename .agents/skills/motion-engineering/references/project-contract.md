# Project contract

`src/projects/contract.ts` defines what a project is. Components draw; the contract holds everything an agent needs to find, register, and validate a project.

## Fields

| Field | Meaning |
|---|---|
| `id` | kebab-case, unique. Also the folder name under `projects/` and `src/projects/`. |
| `title`, `summary` | What the library shows. |
| `kind` | `production` (a video for the owner) or `fixture` (QA/compatibility, never published). |
| `language`, `direction` | `ar` → `rtl`, `en` → `ltr`, `ar-en` → either. Validated. |
| `fps`, `durationInFrames` | Integers. |
| `compositions` | `[{id, format}]` with `format` in `horizontal`, `vertical`, `square`. Composition ids are unique across the registry. |
| `styleId` | One of the four styles or `custom`. |
| `scenes` | `[{id, title, from, durationInFrames, transitionInFrames?, reviewFrame?}]` following the shared scene-layout rules: start at 0, no gaps, overlaps only as declared `transitionInFrames`, last scene ends at `durationInFrames`, review frames where the scene is alone. Build them with `defineScenes([...])`. |
| `fonts` | Bundled font roles used (`display`, `text`). A production with none gets a warning. |
| `assets` | `[{id, path, kind, license}]`; paths relative to `public/`, never `reference/`. |
| `defaultProps`, `editableProps` | Props passed to the component and the subset the library/Studio may change. |
| `docsPath` | `projects/<id>` with `SCRIPT.md`, `STYLE.md`, `SCENES.md` (required for productions). |
| `status.stage` | `draft` → `in-progress` → `review-ready`. Only the owner sets `owner-accepted`. |

## Add a project with the scaffolder (preferred)

```
npm run project:new -- --id ramadan-reel --title "Ramadan reel" --language ar --format vertical,square --fps 30 --duration 15 --style doodle
```

- `--dry-run` prints the plan and writes nothing. Defaults: `ar`, `vertical`, 30 fps, 10 s, `custom` style, title from the id.
- Ids are kebab-case starting with a letter; traversal, reserved names, and duplicate project or composition ids are rejected.
- It creates `projects/<id>/{SCRIPT,STYLE,SCENES}.md`, `src/projects/<id>/project.ts` (stage `draft`, three scenes from `defineScenes` joined by declared fades; one scene under 1.5 s), a `<Pascal>Composition.tsx` built on `<SceneTimeline>`, and inserts two lines above the `// project:new` markers in `registry.ts` (keep those markers).
- All-or-nothing: existing files are never overwritten; a failure removes what it created and restores the registry. It never renders.
- Then fill the docs, run `npm run projects:validate` and `npm run typecheck`, and preview in Studio.

## Add a project by hand

1. Write `projects/<id>/SCRIPT.md`, `STYLE.md`, `SCENES.md`.
2. Build the component in `src/projects/<id>/` with its timeline in a pure module (see `focus-doodle/timeline.ts`).
3. Describe it in `src/projects/<id>/project.ts` with `defineProject({...})` — it throws on invalid data at import time.
4. Add one line to `projectRegistry` in `src/projects/registry.ts`:
   `register(myMeta, () => import('./<id>/MyComposition').then((m) => ({default: m.MyComposition})))`.
   This registers every composition in Studio (folder `Productions` or `QA`) and lists the project in the library with format tabs, scenes, and a Studio deep link.
5. Run `npm run projects:validate` and `npm test`.

Do not hand-write `<Composition>` entries for projects in `RemotionRoot.tsx`; the registry is the single source.

## Owner media

`media?: {assets: string[]; voiceover?: string}` names the imported assets a project uses, by id. The files, their metadata, source paths, and timing stay in the git-ignored `public/user-assets/<id>/assets.json` written by `npm run asset:import`. `npm run projects:validate` reports media that is absent on this machine as a warning (a fresh clone has none) and, when the manifest exists, errors for ids that are not imported, missing files, missing timing, or a voiceover longer than the composition. `assets` (path-based) remains for files deliberately kept in `public/`.
