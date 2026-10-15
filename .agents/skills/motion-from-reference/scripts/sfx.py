"""A small library of motion-graphics sound effects, synthesised (no downloads, no licences to check).

Writes 48 kHz WAVs to public/user-assets/sfx/ (or --out): every one short, clean and quiet enough to sit under
a voice. They are building blocks: pick by what happens on screen, never one on every word.

  tick      a dry tick (a counter, a cursor, a small dot landing)
  click     a UI click (a button, a key)
  type      a burst of keyboard ticks (text being typed, ~0.6 s)
  pop       a round pop (an element appears, a bubble)
  blip      a short pitched blip (a highlight, a selection)
  hit       a soft low thump (a big word lands, a slam)
  impact    a deeper hit with a little noise (the biggest moment, use once or twice)
  whoosh    a short air sweep (a fast move or transition, 0.4 s)
  swish     a longer, softer sweep (a camera move, 0.9 s)
  riser     a rising noise and tone (tension before a reveal, 1.6 s)
  swell     a soft rising pad (a calm build, 2 s)
  shimmer   a light high sparkle (a glow, a spark, a "magic" moment)
  glitch    a short digital stutter (an error, a corruption)
  drop      a falling sub tone (a reveal lands, an ending)
  pen       a soft scratch loop (a line being drawn, 1 s; loop or trim it)

    uv run --no-project --with numpy python .agents/skills/motion-from-reference/scripts/sfx.py
"""
import argparse, wave
from pathlib import Path

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.002, r=0.1, curve=4.0):
    """Attack then exponential-ish release over n samples."""
    x = np.arange(n) / SR
    att = np.clip(x / max(a, 1e-4), 0, 1)
    rel = np.exp(-curve * x / max(r, 1e-4))
    return att * rel


def noise(n):
    return rng.standard_normal(n)


def lowpass(x, cut):
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def sweep_filter(x, f0, f1):
    """One-pole low-pass whose cut-off glides from f0 to f1 (for whooshes)."""
    n = len(x)
    f = np.geomspace(f0, f1, n)
    a = np.exp(-2 * np.pi * f / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(n):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def bandish(x, lo, hi):
    return lowpass(x, hi) - lowpass(x, lo)


def tone(freqs, d):
    """A sine whose frequency follows `freqs` (array or constant) over d seconds."""
    n = int(SR * d)
    f = np.full(n, freqs) if np.isscalar(freqs) else np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(freqs)), freqs)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def fades(x, fi=0.003, fo=0.02):
    n = len(x)
    a, b = int(SR * fi), int(SR * fo)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def norm(x, peak_db=-3.0):
    p = np.max(np.abs(x)) + 1e-9
    return x / p * 10 ** (peak_db / 20)


def make():
    S = {}
    n = int(SR * 0.05)
    S["tick"] = norm(bandish(noise(n), 2500, 9000) * env(n, 0.0005, 0.012), -8)
    n = int(SR * 0.08)
    S["click"] = norm((bandish(noise(n), 1500, 7000) * 0.6 + tone(2200, 0.08) * 0.4) * env(n, 0.0005, 0.02), -7)
    seq = np.zeros(int(SR * 0.7))
    for k in range(9):
        s = int(SR * (0.02 + k * 0.068 + rng.uniform(-0.012, 0.012)))
        m = int(SR * 0.035)
        seq[s: s + m] += bandish(noise(m), 1800, 8000) * env(m, 0.0005, 0.01) * rng.uniform(0.6, 1.0)
    S["type"] = norm(seq, -9)
    d = 0.12
    S["pop"] = norm(tone(np.geomspace(900, 300, 50), d) * env(int(SR * d), 0.001, 0.05), -6)
    d = 0.09
    S["blip"] = norm((tone(1320, d) + 0.3 * tone(2640, d)) * env(int(SR * d), 0.001, 0.035), -10)
    d = 0.45
    n = int(SR * d)
    S["hit"] = norm(tone(np.geomspace(120, 45, 80), d) * env(n, 0.002, 0.12) + 0.15 * lowpass(noise(n), 900) * env(n, 0.001, 0.03), -3)
    d = 0.9
    n = int(SR * d)
    S["impact"] = norm(tone(np.geomspace(90, 32, 120), d) * env(n, 0.002, 0.3) + 0.35 * lowpass(noise(n), 1600) * env(n, 0.001, 0.08), -2)
    for name, d, f0, f1, peak in (("whoosh", 0.4, 300, 5000, -8), ("swish", 0.9, 200, 2500, -12)):
        n = int(SR * d)
        x = sweep_filter(noise(n), f0, f1)
        shape = np.sin(np.linspace(0, np.pi, n)) ** 1.5
        S[name] = norm(fades(x * shape), peak)
    d = 1.6
    n = int(SR * d)
    ramp = np.linspace(0, 1, n) ** 2
    S["riser"] = norm(fades(sweep_filter(noise(n), 200, 7000) * ramp * 0.8 + tone(np.geomspace(180, 720, 100), d) * ramp * 0.25, 0.05, 0.01), -9)
    d = 2.0
    n = int(SR * d)
    pad = sum(tone(f * np.linspace(1, 1.04, 50), d) for f in (220, 277.2, 329.6, 440)) / 4
    S["swell"] = norm(fades(lowpass(pad, 2500) * np.linspace(0, 1, n) ** 1.5, 0.1, 0.15), -14)
    d = 0.8
    n = int(SR * d)
    sh = sum(tone(f, d) * env(n, 0.005 + k * 0.03, 0.25) for k, f in enumerate((2637, 3136, 3951, 4699)))
    S["shimmer"] = norm(sh, -16)
    d = 0.35
    n = int(SR * d)
    g = np.zeros(n)
    for k in range(7):
        s, m = int(SR * k * 0.045), int(SR * 0.03)
        g[s: s + m] += (np.sign(tone(rng.uniform(200, 1400), 0.03)) * 0.5 + bandish(noise(m), 800, 6000)) * rng.uniform(0.4, 1)
    S["glitch"] = norm(g * env(n, 0.001, 0.3, 2), -12)
    d = 1.2
    n = int(SR * d)
    S["drop"] = norm(tone(np.geomspace(160, 38, 120), d) * env(n, 0.003, 0.5, 3), -4)
    d = 1.0
    n = int(SR * d)
    sc = bandish(noise(n), 2000, 6000) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 9 * t(d))))
    S["pen"] = norm(fades(sc, 0.02, 0.05), -22)
    return S


def write(path: Path, x: np.ndarray):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    st = np.repeat(pcm[:, None], 2, axis=1).tobytes()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(st)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/user-assets/sfx")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, x in make().items():
        write(out / f"{name}.wav", x.astype(np.float64))
        print(f"{name:8s} {len(x) / SR:.2f}s")
    print(f"wrote {out}/")


if __name__ == "__main__":
    main()
