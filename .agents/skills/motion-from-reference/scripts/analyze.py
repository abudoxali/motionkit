"""Study a reference video so an agent can see its style: frames, contact sheets, motion strips, palette, pace.

An agent cannot watch a video the way a person does, so this turns one into things it can look at and
numbers it can quote:

  sheets/sheet_NN.jpg   contact sheets: one frame per shot plus an even sample, each stamped with its time
  motion/strip_NN.jpg   the busiest moments as 8 frames 0.1 s apart (how things move, not just how they look)
  palette.png/.json     the dominant colours with their share of the picture, the background and the accent
  audio.wav             the soundtrack (16 kHz mono), when there is one
  report.md             the numbers: duration, size, cuts per minute, shot lengths, motion, brightness, sound

    uv run --no-project --with numpy --with pillow python .agents/skills/motion-from-reference/scripts/analyze.py reference/video.mp4

Needs ffmpeg on the PATH. Output goes to analysis/<video name>/ unless --out is given.
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def run(args, **kw):
    return subprocess.run(args, capture_output=True, **kw)


def probe(path: Path) -> dict:
    err = run(["ffmpeg", "-hide_banner", "-i", str(path)]).stderr.decode("utf-8", "replace")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    if not m:
        sys.exit(f"ffmpeg could not read {path}")
    dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    v = re.search(r"Stream #.*Video:.*?(\d{2,5})x(\d{2,5})", err)
    fps = re.search(r"([\d.]+) fps", err)
    return {
        "duration": round(dur, 3),
        "width": int(v[1]) if v else 0,
        "height": int(v[2]) if v else 0,
        "fps": float(fps[1]) if fps else 0.0,
        "audio": "Audio:" in err,
    }


def motion_curve(path: Path, w: int, h: int, rate=10):
    """Mean absolute frame difference of a tiny grey copy, `rate` samples a second."""
    tw = 96
    th = max(2, int(round(tw * h / max(1, w) / 2)) * 2)
    raw = run(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={rate},scale={tw}:{th},format=gray", "-f", "rawvideo", "-"]).stdout
    fr = np.frombuffer(raw, np.uint8)
    n = len(fr) // (tw * th)
    if n < 2:
        return np.zeros(1), np.zeros(1)
    fr = fr[: n * tw * th].reshape(n, th, tw).astype(np.float32)
    diff = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2)) / 255.0
    luma = fr.mean(axis=(1, 2)) / 255.0
    return diff, luma


def scene_cuts(path: Path, threshold: float) -> list[float]:
    err = run(["ffmpeg", "-hide_banner", "-i", str(path), "-vf", f"scale=320:-2,select='gt(scene,{threshold})',showinfo", "-f", "null", "-"]).stderr.decode("utf-8", "replace")
    return [round(float(t), 2) for t in re.findall(r"pts_time:([\d.]+)", err)]


def grab(path: Path, t: float, out: Path, width: int):
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(path), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", str(out)])
    return out.exists()


def stamp(im: Image.Image, text: str) -> Image.Image:
    d = ImageDraw.Draw(im)
    tw = 8 * len(text) + 10
    d.rectangle([0, 0, tw, 20], fill=(0, 0, 0))
    d.text((5, 4), text, fill=(255, 255, 255))
    return im


def sheets(frames: list[tuple[float, Path]], out: Path, cols=4, rows=4, cell=480):
    out.mkdir(parents=True, exist_ok=True)
    per = cols * rows
    made = []
    for s in range(0, len(frames), per):
        chunk = frames[s: s + per]
        ims = [Image.open(p).convert("RGB") for _, p in chunk]
        ch = int(cell * ims[0].height / ims[0].width)
        r = (len(ims) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell + (cols + 1) * 6, r * ch + (r + 1) * 6), (128, 128, 128))
        for i, ((t, _), im) in enumerate(zip(chunk, ims)):
            im = stamp(im.resize((cell, ch)), f"{t:.1f}s")
            sheet.paste(im, (6 + (i % cols) * (cell + 6), 6 + (i // cols) * (ch + 6)))
        p = out / f"sheet_{len(made) + 1:02d}.jpg"
        sheet.save(p, quality=88)
        made.append(p)
    return made


def palette(frames: list[Path], k=8):
    px = []
    border = []
    for p in frames:
        im = np.asarray(Image.open(p).convert("RGB").resize((64, 36)), np.float32)
        px.append(im.reshape(-1, 3))
        border.append(np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]]))
    X = np.concatenate(px)
    B = np.concatenate(border)
    # k-means, seeded from luminance quantiles so the result is the same every run
    lum = X @ np.array([0.299, 0.587, 0.114], np.float32)
    C = np.stack([X[np.argsort(lum)[int(q * (len(X) - 1))]] for q in np.linspace(0.02, 0.98, k)])
    for _ in range(20):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        C = np.stack([X[lab == i].mean(0) if np.any(lab == i) else C[i] for i in range(k)])
    share = np.bincount(lab, minlength=k) / len(X)
    hexes = ["#%02X%02X%02X" % tuple(int(round(v)) for v in c) for c in C]
    blab = np.argmin(((B[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
    bg = int(np.bincount(blab, minlength=k).argmax())
    sat = (C.max(1) - C.min(1)) / (C.max(1) + 1e-6)
    cand = [i for i in range(k) if share[i] > 0.004 and i != bg]
    accent = max(cand, key=lambda i: sat[i] * (C[i].max() / 255)) if cand else bg
    order = np.argsort(-share)
    colours = [{"hex": hexes[i], "share": round(float(share[i]), 4)} for i in order]
    return colours, hexes[bg], hexes[accent]


def swatches(colours, path: Path):
    im = Image.new("RGB", (120 * len(colours), 150), (255, 255, 255))
    d = ImageDraw.Draw(im)
    for i, c in enumerate(colours):
        rgb = tuple(int(c["hex"][j: j + 2], 16) for j in (1, 3, 5))
        d.rectangle([i * 120, 0, i * 120 + 119, 110], fill=rgb)
        d.text((i * 120 + 6, 116), c["hex"], fill=(0, 0, 0))
        d.text((i * 120 + 6, 132), f"{c['share'] * 100:.1f}%", fill=(0, 0, 0))
    im.save(path)


def audio_stats(path: Path, out: Path):
    wav = out / "audio.wav"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    raw = run(["ffmpeg", "-v", "error", "-i", str(wav), "-f", "f32le", "-"]).stdout
    y = np.frombuffer(raw, np.float32)
    if len(y) < 1600:
        return None
    hop = 160
    n = len(y) // hop
    rms = np.sqrt((y[: n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms / (rms.max() + 1e-9) + 1e-9)
    active = float((db > -35).mean())
    # onsets: the level jumps 9 dB or more within 30 ms (hits, clicks, word starts)
    jump = db[3:] - db[:-3]
    on = np.where((jump > 9) & (db[3:] > -30))[0]
    onsets = []
    for i in on:
        if not onsets or i - onsets[-1] > 12:
            onsets.append(int(i))
    return {"file": wav.name, "active": round(active, 3), "onsets_per_min": round(len(onsets) / (len(y) / 16000 / 60), 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out")
    ap.add_argument("--scene", type=float, default=0.3, help="scene-change threshold (lower = more cuts)")
    a = ap.parse_args()
    src = Path(a.video)
    out = Path(a.out) if a.out else Path("analysis") / src.stem
    (out / "frames").mkdir(parents=True, exist_ok=True)
    (out / "motion").mkdir(parents=True, exist_ok=True)

    info = probe(src)
    dur = info["duration"]
    print(f"{src.name}: {dur:.1f}s {info['width']}x{info['height']} {info['fps']:g} fps, audio: {info['audio']}")

    diff, luma = motion_curve(src, info["width"], info["height"])
    cuts = scene_cuts(src, a.scene)
    bounds = [0.0] + [c for c in cuts if 0.05 < c < dur - 0.05] + [dur]
    shots = np.diff(bounds)

    # frames: the middle of every shot, plus an even sample, merged when closer than 0.4 s
    mids = [(bounds[i] + bounds[i + 1]) / 2 for i in range(len(bounds) - 1)]
    if len(mids) > 64:
        mids = [mids[int(i)] for i in np.linspace(0, len(mids) - 1, 64)]
    step = max(1.0, dur / 48)
    times = sorted(set([round(t, 2) for t in mids] + [round(t, 2) for t in np.arange(step / 2, dur, step)]))
    keep = []
    for t in times:
        if not keep or t - keep[-1] >= 0.4:
            keep.append(t)
    frames = []
    for i, t in enumerate(keep):
        p = out / "frames" / f"f{i:03d}_{t:07.2f}s.jpg"
        if grab(src, t, p, 960):
            frames.append((t, p))
    made = sheets(frames, out / "sheets")

    # motion strips: the busiest moments, at least 2 s apart
    rate = 10
    strips = []
    if len(diff) > 4:
        sm = np.convolve(diff, np.ones(5) / 5, mode="same")
        for i in np.argsort(-sm):
            t = (i + 1) / rate
            if t < 0.5 or t > dur - 0.5 or any(abs(t - s) < 2.0 for s in strips):
                continue
            strips.append(round(float(t), 2))
            if len(strips) >= 6:
                break
    strips.sort()
    for j, t in enumerate(strips):
        p = out / "motion" / f"strip_{j + 1:02d}_{t:06.2f}s.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t - 0.4):.2f}", "-i", str(src), "-t", "0.8", "-vf", "fps=10,scale=480:-2,tile=4x2:padding=4:color=gray", "-frames:v", "1", "-q:v", "3", str(p)])

    colours, bg, accent = palette([p for _, p in frames])
    swatches(colours, out / "palette.png")
    (out / "palette.json").write_text(json.dumps({"background": bg, "accent": accent, "colours": colours}, indent=1))

    snd = audio_stats(src, out) if info["audio"] else None
    still = float((diff < 0.004).mean()) if len(diff) else 0.0

    rep = [
        f"# Analysis: {src.name}",
        "",
        "| | |",
        "|---|---|",
        f"| duration | {dur:.2f} s |",
        f"| size | {info['width']}x{info['height']} at {info['fps']:g} fps |",
        f"| hard cuts | {len(bounds) - 2} ({(len(bounds) - 2) / max(dur / 60, 1e-6):.1f} per minute; animated transitions show up as motion strips instead) |",
        f"| shot length | mean {shots.mean():.2f} s, median {np.median(shots):.2f} s, shortest {shots.min():.2f} s, longest {shots.max():.2f} s |",
        f"| motion | mean frame change {diff.mean() * 100:.2f}%, still {still * 100:.0f}% of the time |",
        f"| brightness | mean {luma.mean() * 100:.0f}% ({'dark' if luma.mean() < 0.35 else 'light' if luma.mean() > 0.65 else 'mid'} picture) |",
        f"| background | {bg} |",
        f"| accent | {accent} |",
        f"| palette | {', '.join(c['hex'] + ' ' + format(c['share'] * 100, '.0f') + '%' for c in colours)} |",
    ]
    if snd:
        rep.append(f"| sound | sound in {snd['active'] * 100:.0f}% of the time, {snd['onsets_per_min']} onsets per minute (hits, clicks, word starts) |")
    else:
        rep.append("| sound | none |")
    rep += [
        "",
        f"Cut times: {', '.join(f'{c:.2f}' for c in bounds[1:-1]) or 'none'}",
        "",
        "## Look at",
        *[f"- `{p.relative_to(out)}`" for p in made],
        *[f"- `motion/{p.name}` (8 frames, 0.1 s apart)" for p in sorted((out / 'motion').glob('*.jpg'))],
        "- `palette.png`",
        *(["- `audio.wav` (listen for: voice or not, music or not, which sound effects and how often)"] if snd else []),
    ]
    (out / "report.md").write_text("\n".join(rep) + "\n")
    print("\n".join(rep))
    print(f"\nwrote {out}/")


if __name__ == "__main__":
    main()
