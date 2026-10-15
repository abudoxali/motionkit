"""A simple background-music bed, synthesised (no downloads, no licences to check).

Chords on a soft pad, a sub bass, and for the livelier moods a plucked arpeggio, a soft kick and hats.
It is a bed, not a song: it sits under a voice or carries a video that has none. Fades in and out.

  calm    slow pad and bass only (explainers, thoughtful pieces)
  tech    pad, pulsing bass, arpeggio, soft kick and hats (tech, product, "how it works")
  bright  major key, arpeggio and hats, no kick (upbeat, friendly, promos)

    uv run --no-project --with numpy python .agents/skills/motion-from-reference/scripts/music.py --mood tech

The length comes from src/motion/data/words.json (the video plus a second), or from --duration.

Writes public/user-assets/music.wav (or --out). In Remotion play it with volume 0.12-0.2 under a voice,
0.35-0.5 when there is no voice.
"""
import argparse, json, wave
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(3)

# chord roots and qualities (semitones from A2 = 110 Hz)
PROGS = {
    "minor": [(0, "m"), (8, "M"), (3, "M"), (10, "M")],   # Am  F  C  G
    "major": [(3, "M"), (10, "M"), (0, "m"), (8, "M")],   # C   G  Am F
}
SHAPE = {"m": (0, 3, 7), "M": (0, 4, 7)}


def hz(semi, base=110.0):
    return base * 2 ** (semi / 12)


def voice(f, n, harmonics=6, bright=0.55, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, harmonics + 1):
        out += (bright ** (h - 1)) / h * np.sin(2 * np.pi * f * h * (1 + detune) * t + rng.uniform(0, 6.28))
    return out


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na) ** 2
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def pluck(f, d):
    n = int(d * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 9)


def make(duration: float, bpm: float, mood: str):
    n = int(duration * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    beat = 60.0 / bpm
    bar = 4 * beat
    chord_len = 2 * bar
    prog = PROGS["major" if mood == "bright" else "minor"]

    t0, k = 0.0, 0
    while t0 < duration:
        root, q = prog[k % len(prog)]
        a, b = int(t0 * SR), min(n, int((t0 + chord_len + 0.6) * SR))
        m = b - a
        e = env_adsr(m, 0.9, 1.2)
        for iv in SHAPE[q] + (12,):
            f = hz(root + iv + 12)
            L[a:b] += 0.11 * voice(f, m, detune=-0.0025) * e
            R[a:b] += 0.11 * voice(f, m, detune=0.0025) * e
        # sub bass: held (calm) or pulsing on the beat
        fb = hz(root - 12)
        if mood == "calm":
            sb = 0.22 * np.sin(2 * np.pi * fb * np.arange(m) / SR) * e
            L[a:b] += sb
            R[a:b] += sb
        else:
            for i in range(8):
                s = int((t0 + i * beat) * SR)
                d = int(beat * 0.9 * SR)
                if s + d > n:
                    break
                tt = np.arange(d) / SR
                sb = 0.25 * np.sin(2 * np.pi * fb * tt) * np.exp(-tt * 3.5)
                L[s:s + d] += sb
                R[s:s + d] += sb
        # arpeggio in eighths over the chord
        if mood in ("tech", "bright"):
            tones = [root + iv + 24 for iv in SHAPE[q]] + [root + SHAPE[q][1] + 36]
            for i in range(16):
                s = int((t0 + i * beat / 2) * SR)
                p = pluck(hz(tones[(i * 3) % len(tones)]), beat * 1.2)
                e2 = min(n, s + len(p))
                if s >= n:
                    break
                pan = 0.5 + 0.35 * np.sin(i * 1.3)
                L[s:e2] += 0.06 * (1 - pan) * p[: e2 - s]
                R[s:e2] += 0.06 * pan * p[: e2 - s]
        t0 += chord_len
        k += 1

    # drums
    if mood in ("tech", "bright"):
        nb = int(duration / beat)
        for i in range(nb):
            if mood == "tech" and i % 2 == 0:  # soft kick on 1 and 3
                s = int(i * beat * SR)
                d = int(0.35 * SR)
                if s + d < n:
                    tt = np.arange(d) / SR
                    kk = 0.35 * np.sin(2 * np.pi * np.cumsum(np.geomspace(110, 45, d)) / SR) * np.exp(-tt * 12)
                    L[s:s + d] += kk
                    R[s:s + d] += kk
            s = int((i + 0.5) * beat * SR)  # hats on the off-beats
            d = int(0.05 * SR)
            if s + d < n:
                h = np.diff(rng.standard_normal(d + 1)) * np.exp(-np.arange(d) / SR * 70) * 0.05
                L[s:s + d] += h * 0.8
                R[s:s + d] += h

    fade_in, fade_out = int(2.0 * SR), int(3.0 * SR)
    for ch in (L, R):
        ch[:fade_in] *= np.linspace(0, 1, fade_in)
        ch[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
    st = np.stack([L, R], 1)
    return st / (np.max(np.abs(st)) + 1e-9) * 10 ** (-3 / 20)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration", type=float, help="seconds (default: the duration in --words, plus 1)")
    ap.add_argument("--words", default="src/motion/data/words.json", help="timings written by align.py")
    ap.add_argument("--mood", choices=["calm", "tech", "bright"], default="calm")
    ap.add_argument("--bpm", type=float, help="tempo (default: calm 80, tech 108, bright 116)")
    ap.add_argument("--out", default="public/user-assets/music.wav")
    a = ap.parse_args()
    if a.duration is None:
        try:
            a.duration = float(json.loads(Path(a.words).read_text(encoding="utf-8"))["duration"]) + 1.0
        except (OSError, KeyError, ValueError):
            raise SystemExit(f"no --duration and could not read the duration from {a.words}: run align.py first")
    bpm = a.bpm or {"calm": 80, "tech": 108, "bright": 116}[a.mood]
    st = make(a.duration, bpm, a.mood)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"{a.mood} {bpm:g} bpm, {a.duration:.1f}s -> {out}")


if __name__ == "__main__":
    main()
