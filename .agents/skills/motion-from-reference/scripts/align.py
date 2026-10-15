"""Word timings for the video: when every word of the script is said, written to the --out JSON.

For a project voiceover use `npm run voiceover:align -- --project <id>`: it runs this script on the
imported (unmodified) recording and writes project-scoped timing to
public/user-assets/<project>/timing/<voiceover>.json. Never share one timing file between projects.

With a voiceover: CTC forced alignment of the known script against the audio, with Meta's MMS model
(torchaudio's MMS_FA, 1100+ languages) on uroman-romanized text. Numbers, acronyms and symbols become
the model's star token, which absorbs however the voice read them. Word edges are refined against the
audio's energy. --gap adds a reading pause after every line (silence inserted at the quietest point
between lines; the audio is rewritten as <name>.paced.mp3 and every timing moves with it).

    uv run --no-project --python 3.12 --with torch==2.5.1 --with torchaudio==2.5.1 --with uroman --with numpy \
        python .agents/skills/motion-from-reference/scripts/align.py --audio voice.mp3 --script script.txt --out timing.json

Without a voiceover (sound effects only): the same file from a reading speed, so the scenes work the same.

    uv run --no-project python .agents/skills/motion-from-reference/scripts/align.py --script script.txt --wps 2.2 --gap 0.8 --out timing.json

--gap writes a NEW paced copy (<name>.paced.mp3) and never edits the original; the project workflow
does not use it, because the owner's recording is the timing source.

script.txt: one line per on-screen line or sentence. [ElevenLabs tags] are ignored, and so is "...".
"""
import argparse, json, re, subprocess
from pathlib import Path

SR = 16000
AR = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿ]")
EDGE = "«»“”\"'.,،؛;؟?:!…()[]{}-–—"


def read_script(path: Path) -> list[list[str]]:
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = re.sub(r"\[[^\]]*\]", " ", raw)  # ElevenLabs tags
        s = s.replace("...", " ").replace("…", "… ").strip()
        toks = [t for t in s.split() if t.strip(EDGE)]
        if toks:
            lines.append(toks)
    if not lines:
        raise SystemExit(f"{path} has no words")
    return lines


def key(tok: str) -> str:
    return tok.strip(EDGE).lower()


def speed_timings(lines, wps: float, gap: float, lead=0.5, tail=1.0):
    """No audio: each word takes 1/wps seconds, scaled a little by its length."""
    t = lead
    out = []
    for toks in lines:
        ws = []
        for tok in toks:
            n = len(key(tok)) or 1
            d = (1.0 / wps) * min(1.6, max(0.6, n / 5))
            ws.append({"w": tok, "start": round(t, 3), "end": round(t + d * 0.92, 3)})
            t += d
        out.append({"text": " ".join(toks), "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
        t += gap
    return out, round(out[-1]["end"] + tail, 3)


def load_audio(path: Path):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def aligned_timings(lines, audio: Path, lang: str):
    import numpy as np
    import torch
    import torchaudio
    import uroman as ur

    y = load_audio(audio)
    dur = len(y) / SR
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True)
    DICT = bundle.get_dict(star="*")
    roman = ur.Uroman()

    toks = []  # (line, display, ids)
    for li, line in enumerate(lines):
        for disp in line:
            k = key(disp).replace("ـ", "")
            if re.search(r"\d", k) or (k.isascii() and disp.strip(EDGE).isupper() and len(k) <= 5):
                ids = [DICT["*"]]  # numbers and acronyms: however they were read
            else:
                r = roman.romanize_string(k, lcode=lang) if AR.search(k) else k
                r = r.lower().replace("’", "'")
                ids = [DICT[c] for c in r if c in DICT and c != "*"]
            toks.append((li, disp, ids))

    with torch.inference_mode():
        emission, _ = model(torch.from_numpy(y).unsqueeze(0))
    targets = torch.tensor([[i for *_, ids in toks for i in ids]], dtype=torch.int32)
    ali, scores = torchaudio.functional.forced_align(emission, targets, blank=0)
    spans = torchaudio.functional.merge_tokens(ali[0], scores[0].exp())
    sec = len(y) / emission.size(1) / SR

    hop = SR // 100
    n = len(y) // hop
    env = np.sqrt(np.convolve((y[: n * hop] ** 2).reshape(n, hop).mean(1), np.ones(3) / 3, mode="same"))
    db = 20 * np.log10(env / (env.max() + 1e-9) + 1e-9)
    loud = lambda t: db[min(n - 1, max(0, int(t * 100)))] > -38.0

    words, k = [], 0
    for li, disp, ids in toks:
        if not ids:
            words.append([li, disp, None, None, 1.0])  # a symbol (← — •): nothing to hear
            continue
        ss = spans[k: k + len(ids)]
        k += len(ids)
        a, b = ss[0].start * sec, ss[-1].end * sec
        if ids == [DICT["*"]]:
            # the star can swallow the silence around it: it starts on voice and ends at the first real pause
            while a < b - 0.1 and not loud(a):
                a += 0.01
            run, t = 0, a + 0.3
            while t < b:
                run = run + 1 if db[min(n - 1, int(t * 100))] < -40 else 0
                if run >= 15:
                    b = t - 0.15
                    break
                t += 0.01
        words.append([li, disp, a, b, float(np.mean([s.score for s in ss]))])

    spoken = [w for w in words if w[2] is not None]
    for i, w in enumerate(spoken):
        prev_end = spoken[i - 1][3] if i else 0.0
        next_start = spoken[i + 1][2] if i + 1 < len(spoken) else dur
        a, b = w[2], w[3]
        lim = max(prev_end + 0.01, a - 0.12)
        while a - 0.01 > lim and loud(a - 0.01):
            a -= 0.01
        lim = min(next_start - 0.02, b + 0.25)
        while b + 0.01 < lim and loud(b + 0.01):
            b += 0.01
        w[2], w[3] = round(max(0.0, a - 0.02), 3), round(max(a + 0.06, b), 3)
    for i, w in enumerate(words):  # words with nothing to say sit just after the previous word
        if w[2] is None:
            pe = next((x[3] for x in reversed(words[:i]) if x[2] is not None), 0.0)
            ns = next((x[2] for x in words[i + 1:] if x[2] is not None), dur)
            w[2] = round(pe + 0.02, 3)
            w[3] = round(min(ns - 0.01, w[2] + 0.12), 3)

    out = []
    for li, line in enumerate(lines):
        ws = [{"w": w[1], "start": w[2], "end": w[3], "conf": round(w[4], 3)} for w in words if w[0] == li]
        out.append({"text": " ".join(line), "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
    return out, y, round(dur, 3)


def add_pauses(lines, y, audio: Path, gap: float, tail: float):
    """Silence after every line, at the quietest 10 ms between it and the next; timings move with it."""
    import numpy as np
    hop = SR // 100
    env = np.sqrt(np.convolve(y ** 2, np.ones(hop) / hop, mode="same"))
    ins = []
    for i in range(len(lines) - 1):
        a, b = lines[i]["end"], lines[i + 1]["start"]
        if b - a > 0.03:
            i0, i1 = int(a * SR), int(b * SR)
            ins.append((i0 + int(np.argmin(env[i0:i1]))) / SR)
        else:
            ins.append((a + b) / 2)
    shift = lambda t: t + gap * sum(1 for p in ins if p <= t)
    # re-read at full quality for the output
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "2", "-ar", "48000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    hi = np.frombuffer(raw, np.float32).reshape(-1, 2)
    parts, last = [], 0
    for p in ins:
        k = int(round(p * 48000))
        parts += [hi[last:k], np.zeros((int(round(gap * 48000)), 2), np.float32)]
        last = k
    parts += [hi[last:], np.zeros((int(round(tail * 48000)), 2), np.float32)]
    o = np.concatenate(parts)
    dst = audio.with_name(audio.stem + ".paced.mp3")
    pcm = (np.clip(o, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", "-", "-c:a", "libmp3lame", "-b:a", "192k", str(dst)], input=pcm, check=True)
    for l in lines:
        l["start"], l["end"] = round(shift(l["start"]), 3), round(shift(l["end"]), 3)
        for w in l["words"]:
            w["start"], w["end"] = round(shift(w["start"]), 3), round(shift(w["end"]), 3)
    return dst, round(len(o) / 48000, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True, help="the script, one line per on-screen line")
    ap.add_argument("--audio", help="the voiceover (leave out for sound-effects-only videos)")
    ap.add_argument("--out", required=True, help="output JSON; project timing lives in public/user-assets/<project>/timing/")
    ap.add_argument("--lang", default="ara", help="uroman language code (ara, eng, ...)")
    ap.add_argument("--gap", type=float, default=0.0, help="seconds of reading pause added after every line")
    ap.add_argument("--wps", type=float, default=2.2, help="words per second when there is no audio")
    a = ap.parse_args()

    lines = read_script(Path(a.script))
    if a.audio:
        audio = Path(a.audio)
        lines_t, y, dur = aligned_timings(lines, audio, a.lang)
        name = audio.name
        if a.gap > 0:
            dst, dur = add_pauses(lines_t, y, audio, a.gap, tail=0.6)
            name = dst.name
        source = f"align.py: MMS_FA forced alignment{f', +{a.gap}s after every line' if a.gap > 0 else ''}"
    else:
        lines_t, dur = speed_timings(lines, a.wps, a.gap or 0.8)
        name = None
        source = f"align.py: reading speed {a.wps} words/s (no voiceover)"

    data = {"source": source, "audio": name, "duration": dur, "lines": lines_t}
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    for l in lines_t:
        low = [w["w"] for w in l["words"] if w.get("conf", 1) < 0.2]
        print(f"{l['start']:6.2f}–{l['end']:6.2f}  {l['text'][:70]}{'   low confidence: ' + ' '.join(low) if low else ''}")
    print(f"duration {dur:.2f}s, audio: {name}; wrote {out}")


if __name__ == "__main__":
    main()
