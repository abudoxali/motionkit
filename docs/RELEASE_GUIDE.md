# MotionKit — Installation & GitHub Release Guide

**MotionKit** is distributed as a **GitHub source-based developer tool** powered by Remotion, React, TypeScript, and a local coding agent.

It is NOT a SaaS service, hosted web editor, closed binary, or Windows installer. It runs entirely on the developer's local machine.

---

## 1. Developer Installation

### Prerequisites
- **Node.js:** v20.0.0 or newer
- **Git**
- **npm** (bundled with Node.js)
- *Optional:* FFmpeg and ffprobe on PATH (for importing personal audio/video assets and full media validation)
- *Optional:* Python `uv` (for offline forced audio alignment)

### First-Time Setup

```bash
git clone https://github.com/abudoxali/abud-motion-studio.git
cd abud-motion-studio
npm ci
npm run doctor
```

The repository currently remains private until the owner separately authorizes public access.

---

## 2. Launching MotionKit

### Unified Single-Command Launch (Recommended)

```bash
npm start
```

This starts both:
1. **MotionKit Library:** `http://127.0.0.1:4173` — browse styles, 12 presets, compositions, and assets.
2. **Remotion Studio:** `http://localhost:3000` — frame-accurate timeline scrubbing and playback.

Press `Ctrl+C` in your terminal to cleanly stop all background services.

### Independent Service Commands

If you prefer separate terminal windows:
- Visual Library only: `npm run library`
- Remotion Studio only: `npm run studio:open`

If port 3000 is occupied, Remotion Studio can be launched on an alternate port:
```bash
STUDIO_PORT=3100 npm start
# or:
npm run studio -- --port 3100
```

---

## 3. Coding Agent Setup

Start Claude Code, OpenAI Codex, or Antigravity inside the repository root.

The agent automatically reads the canonical project contract in `AGENTS.md` and discovers specialized modular skills in `.agents/skills/`:
- `abud-creative-director`: Visual hooks, story beats, camera choreography.
- `motion-from-reference`: Style extraction and reference analysis.
- `motion-engineering`: Core animation, layout, transitions, presets, project contract.
- `arabic-typography`: Bundled fonts, bidirectional text isolation, and text fitting.
- `quality-assurance`: Vitest tests, Playwright browser tests, visual baselines.

**Export Boundary:** Coding agents can create, edit, test, and preview compositions, but are strictly prohibited from rendering final videos. The final MP4 export is interactive and owner-only (`npm run export -- <id>`).

---

## 4. Packaging the Release Distribution

To package a clean, production-ready source release:

```bash
npm run validate
npm run projects:validate
npm run skills:sync -- --check
npm run test:e2e
npm run release:package
```

### Packaging & Privacy Protections

`npm run release:package` enforces strict distribution safety:
1. **Tracked Cleanliness:** Refuses to run if any tracked Git files have uncommitted changes.
2. **Credential & Secret Protection:** Inspects all committed files and refuses known private asset paths (`out/`, `exports/`, `analysis/`, `reference/user/`, `public/user-assets/`, `.claude/launch.json`), uncommitted `.env` files, and media binaries (`.mp3`, `.wav`, `.mp4`, `.mov`, `.key`, `.pem`).
3. **Public Distribution Separation:**
   - Excludes owner-specific private productions and personal scripts from the public package.
   - Automatically sanitizes `src/projects/registry.ts` in the archive so no broken imports exist in the distribution.
   - Retains all reusable engine components, 12 presets, 4 styles, typography fixtures, and the Focus Doodle compatibility fixture.
4. **Automated Smoke Verification:**
   - Unpacks the generated ZIP into a clean temporary directory.
   - Verifies absence of excluded owner files.
   - Runs `doctor`, `typecheck`, `projects:validate`, and `vite build` on the extracted archive.
5. **Artifact Outputs (in `release-artifacts/`):**
   - `motionkit-v<version>-source.zip`
   - `SHA256SUMS.txt` with cryptographic hash

---

## 5. Owner Pre-Release Acceptance Checklist

Before public release:

1. [x] Canonical product name confirmed as **MotionKit** (ABUD FUN as publisher credit).
2. [x] Original vector brand identity implemented (`public/branding/`, `favicon.svg`) and **approved by the owner on 2026-10-15**.
3. [x] Complete UI/UX redesign implemented, responsive, and verified with diagnostic screenshots.
4. [x] Unified developer launcher (`npm start`) implemented with graceful termination.
5. [x] Diagnostic `npm run doctor` implemented with platform and port checks.
6. [x] Public distribution packaging implemented and verified via automated smoke test.
7. [x] Owner media and client productions safely excluded from public package.
8. [x] All automated gates pass:
   - `npm run validate` (Vitest, typecheck, build)
   - `npm run projects:validate`
   - `npm run skills:sync -- --check`
   - `npm run test:e2e` (Playwright)
9. [x] GitHub Actions CI passes on both Ubuntu Foundation and Windows Browser QA.
10. [x] Sanitize the public-distribution copy of internal STATUS.md and review all shipped example-project source and documentation for owner-only references, including Focus Doodle. Validate the exact ZIP contents after sanitization.
11. [x] Regenerate the ZIP and SHA-256; rerun independent clean install, tests, and CI on the exact final release commit.
12. [ ] Owner accepts the public version/tag and release notes.
13. [ ] Owner separately authorizes the clean-history public repository creation/visibility and GitHub Release publication.

Do not publish publicly, change repository visibility, or merge PR #2 without explicit owner authorization.

---

## 6. Safest Procedure for Clean-History Public Distribution

When publishing MotionKit as a public open-source developer tool, creating a **separate clean-history public repository** from the verified distribution archive is the safest path.

### Why Clean-History Distribution?
1. **Privacy & History Isolation:** Prevents exposing internal development history, draft commit messages, deleted branches, or historical diffs from private client experiments.
2. **Deterministic Source:** The public release archive must be sanitized and reviewed for internal status history and example-project content before publication, even if it passes automated smoke tests.
3. **Repository Preservation:** The existing internal workspace (`abud-motion-studio`) remains intact as the private development monorepo.

### Step-by-Step Distribution Procedure (Awaiting Owner Authorization)

```bash
# 1. Generate and verify the clean distribution package
npm run release:package

# 2. Extract into a clean, isolated directory outside the dev workspace
mkdir -p /tmp/motionkit-dist
tar -xf release-artifacts/motionkit-v0.1.0-source.zip -C /tmp/motionkit-dist
cd /tmp/motionkit-dist

# 3. Initialize a pristine Git repository
git init -b main
git add .
git commit -m "feat: initial public release of MotionKit v0.1.0"
git tag -a v0.1.0 -m "MotionKit v0.1.0 — Initial Developer Release"

# 4. Link to the target public GitHub repository (e.g. abudoxali/motionkit or authorized public repo)
# NOTE: Run only after owner authorizes public repository creation:
# git remote add origin https://github.com/<org-or-user>/motionkit.git
# git push -u origin main --tags

# 5. Attach release artifacts to GitHub Release:
# - motionkit-v0.1.0-source.zip
# - SHA256SUMS.txt
```

> [!IMPORTANT]
> **Owner Authorization Barrier:**
> An agent must never create public repositories, push to public remotes, change visibility, or merge PR #2 autonomously.

