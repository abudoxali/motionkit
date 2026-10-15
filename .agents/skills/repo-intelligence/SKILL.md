---
name: repo-intelligence
description: Navigate MotionKit with the local Graft wiring graph instead of reading whole files — orient with graft map, find code with graft ask --source, read APIs with graft skeleton, check impact with graft callers and graft blast, and keep the graph fresh with graft check/build. Use this at the start of any non-trivial code task, before broad file reads, before changing a shared function, or when asked where something lives or what depends on it.
---

# Repository intelligence

Spend tokens on the code that matters. `AGENTS.md` controls; Graft is a local, read-mostly tool here.

## When to use

Before reading code you have not seen this session, before changing a shared symbol, and when asked where something lives or what depends on it.

## Allowed commands (Graft 0.21.x)

| Step | Command |
|---|---|
| Freshness | `graft check` — if stale, `graft build` (local wiring graph, free) |
| Orientation | `graft map` |
| Find code | `graft ask "<question>" --source` (add `--in src/motion` to narrow, `-n 5` to cap) |
| File API | `graft skeleton <file>` |
| Impact | `graft callers <symbol>` (`--depth all` for blast radius, `--direction out` for callees) |
| Diff impact | `graft blast` |
| Regex by symbol | `graft grep "<pattern>"` |

Never run `graft init`, `graft uninstall`, `graft build --deep` (paid LLM), `graft upgrade`, `graft mcp`, Graft hooks, or telemetry changes, and never change machine-wide or global agent settings. The `graft/` cache is ignored by Git.

## Routine

1. `graft check`; rebuild only if stale.
2. `graft map` once per session for the layout and hubs.
3. `graft ask ... --source` or `graft skeleton` for the symbols you need.
4. `graft callers <symbol>` before editing anything with more than one caller.
5. Read a full file only when the excerpt is not enough, and then only the needed range.

If Graft is unavailable, use `rg` with tight globs and targeted line ranges.

## Done means

You can name the files and symbols you changed and their callers, and you did not read directories wholesale. When reporting token savings, quote Graft's own "tokens saved" lines; do not estimate.
