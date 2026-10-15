# MotionKit — Brand Identity & Design System

## 1. Product Identity

**Approved Product Name:** MotionKit  
**Developer / Publisher Attribution:** ABUD FUN  
**Category:** Local-first, AI-agent-assisted motion graphics developer tool.  
**Tagline:** Direct the idea. Code the motion.  

MotionKit is the single canonical product name. "ABUD FUN" represents publisher attribution only and must not be used as a product prefix or suffix (e.g. do not use "ABUD MotionKit" or "MotionKit Pro").

---

## 2. Visual Design System

The MotionKit identity communicates:
**Creative Freedom + Motion Engineering + AI-Agent Workflow.**

It establishes a modern, high-contrast, developer-grade aesthetic tailored for engineers and creative directors.

### Color Tokens

| Token | Hex Value | Role |
|---|---|---|
| **Canvas Background** | `#090B10` | Base backdrop for the entire workspace |
| **Surface** | `#0F131C` | Topbar, sidebar catalog panel, container surfaces |
| **Card / Elevated** | `#141926` | Project cards, preset buttons, controls dock |
| **Card Hover** | `#192030` | Interactive element hover state |
| **Card Active** | `#1F273B` | Active selected element state |
| **Border Subtle** | `#1A2030` | Section dividers and panel seams |
| **Border Normal** | `#242C40` | Structural card and input boundaries |
| **Electric Periwinkle** | `#8F8AFF` | Primary brand accent, focused selections, studio CTA |
| **Periwinkle Hover** | `#A5A1FF` | Interactive accent hover |
| **Soft Mint** | `#70E1C4` | Secondary signal, local-first status, project indicators |
| **Amber Signal** | `#F59E0B` | Non-blocking warnings and diagnostics |
| **Coral Accent** | `#F43F5E` | Missing asset indicators and errors |
| **Text Primary** | `#F8FAFC` | Headings, titles, high-contrast values |
| **Text Body** | `#CBD5E1` | Standard reading copy, labels, details |
| **Text Muted** | `#94A3B8` | Secondary labels, descriptions, facts |
| **Text Faint** | `#64748B` | Footers, subtle hints, empty state details |

---

## 3. Vector Logo System

All brand assets are 100% project-owned vector SVGs located in `public/branding/` and `public/`:

- **Primary Logo Lockup:** `public/branding/motionkit-logo.svg`  
  Combines the compact mark with the "MotionKit" wordmark and "BY ABUD FUN" attribution.
- **Compact Mark:** `public/branding/motionkit-mark.svg`  
  Framing corner brackets (representing composition viewport boundaries) intersecting an internal 45-degree keyframe diamond with motion velocity echoes. Crisp and recognizable at 16×16, 32×32, and 64×64.
- **Monochrome Mark:** `public/branding/motionkit-mark-mono.svg`  
  Single-color version for docs, terminal output, and dark/light contrast backgrounds.
- **Favicon:** `public/favicon.svg`  
  Modern 64×64 SVG browser favicon.
- **Social Banner:** `public/branding/motionkit-social-card.svg`  
  1200×630 technical showcase banner with Remotion frame boundary guides and capability pills.

---

## 4. Typography

- **Display & Headings:** Clean technical Latin sans with tight letter-spacing (`-0.02em` to `-0.04em`), paired with bundled Cairo display font for Arabic headlines.
- **Body & Controls:** `"ABUD Plex Arabic"` bundled font first, ensuring Arabic copy in UI controls matches Remotion composition typography.
- **Code & Values:** System monospace stack (`ui-monospace`, `SFMono-Regular`, `Consolas`, `monospace`).

---

## 5. Creative Freedom Principle

**The MotionKit brand design applies strictly to the software developer interface.**

It does **NOT** dictate or constrain the visual style of generated motion compositions:
- Preserved styles (Plotter, Doodle, Whiteboard, Chalkboard) retain their independent artistic palettes and drawing grammars.
- User-created compositions and client productions maintain complete creative independence.
- Coding agents can freely combine presets, modify themes, or write completely bespoke Remotion components.
