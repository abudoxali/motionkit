# Product inspection

Build the story from observable product truth.

## Repository-first retrieval

Use progressive context, not a broad repository dump:

1. `graft map` for boundaries and hubs.
2. `graft ask "<specific product question>" --source --in <subsystem>` for ranked evidence.
3. `graft skeleton <file>` for an API surface before opening a long implementation.
4. `graft callers <symbol> --depth 2` for dependencies and change impact.
5. Read full source only when the returned excerpt is insufficient for implementation or claim verification.

If Graft is unavailable, use `rg` and targeted file reads. Do not block creative work on optional tooling.

## Product truth sheet

Record these facts in the video's project folder before storyboarding:

- What the product actually does, in one sentence.
- Who performs the main workflow and what problem it resolves.
- The strongest verified capability or transformation.
- The real happy path: entry → meaningful action → observable result.
- The most filmable real interface, component, interaction, or repository behavior.
- Exact visual identity: background, text, accent colors, typography, shape language, density, and motion already present.
- Target platform, format, duration, language, and audio posture.
- Approved assets and their rights/source status.

Prefer working UI and verified source behavior over landing-page claims. If a capability cannot be demonstrated or verified, omit it or label it as a concept—not a product fact.

## Privacy screen

Before using screenshots or examples, remove or replace secrets, tokens, emails, customer names, internal hostnames, database records, private repository content not intended for publication, and user-identifying data. Use neutral fixtures only when they do not imply real customers or results.
