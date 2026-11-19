#!/usr/bin/env python3
"""Noisy-fragment benchmark for the evidence matcher (t1578u).

Simulates what an inspector's phone records in a café: a 10–30 s fragment of a track, room
reverberation, café noise (ambience + several voices) at a given SNR, phone-like band limit,
dynamic compression and AAC encoding. Then runs the same window/segment logic as `match`.

Usage:
  noisy_benchmark.py --index DIR --catalog-dir DIR --catalog-codes a,b,... \
      --foreign f1.mp3,f2.mp3 --noise n1.ogg,n2.mp3 --out results.json [--seed 1578]
Queries from catalog tracks must be in the index; foreign queries must NOT be in the index.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evidence_match as em  # noqa: E402

LENGTHS = (10.0, 20.0, 30.0)
SNRS = (10.0, 5.0, 0.0)


def rir(rng, sr, rt60=0.45):
    n = int(sr * rt60)
    t = np.arange(n) / sr
    h = rng.standard_normal(n) * np.exp(-6.9 * t / rt60)
    h[0] = 1.0
    return h / np.sqrt(np.sum(h ** 2))


def fft_conv(x, h):
    n = len(x) + len(h) - 1
    nfft = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)[:len(x)]
    return y


def noise_bed(rng, noises, n, sr):
    bed = np.zeros(n)
    for k, src in enumerate(noises):
        if len(src) < sr:
            continue
        start = int(rng.integers(0, max(1, len(src) - n)))
        piece = src[start:start + n]
        if len(piece) < n:
            piece = np.tile(src, int(np.ceil(n / len(src))) + 1)[start:start + n]
        gain = 1.0 if k == 0 else rng.uniform(0.3, 0.8)
        bed += gain * piece / (np.sqrt(np.mean(piece ** 2)) + 1e-9)
    # occasional steam / grinder bursts
    t = 0
    while t < n:
        t += int(rng.uniform(3, 9) * sr)
        ln = int(rng.uniform(0.5, 2.0) * sr)
        if t + ln < n:
            burst = rng.standard_normal(ln) * np.hanning(ln) * 1.5
            bed[t:t + ln] += burst
    return bed


def phone_chain(x, sr, tmp, tag):
    raw = os.path.join(tmp, tag + ".wav")
    em.write_wav(raw, x / (np.max(np.abs(x)) + 1e-9) * 0.9, sr)
    aac = os.path.join(tmp, tag + ".m4a")
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", raw, "-af",
                    "highpass=f=150,lowpass=f=7000,acompressor=threshold=-24dB:ratio=4:attack=5:release=120,volume=3dB",
                    "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "96k", aac], check=True)
    return aac


def run_fragment(path, index, ht, kinds, olaf, olaf_home, tmp):
    audio = em.decode(path, em.SR)
    dur = len(audio) / em.SR
    an = em.make_analyzer(4)
    matcher = em.make_matcher()
    windows, files = [], []
    starts, t = [], 0.0
    while t + 5.0 <= dur + 1e-6:
        starts.append(t)
        t += 5.0
    audio16 = em.decode(path, em.OLAF_SR) if olaf else None
    for n, s in enumerate(starts):
        seg = audio[int(s * em.SR): int((s + 10) * em.SR)]
        w = {"n": n, "rec_from_s": s, "rec_to_s": min(s + 10, dur),
             "audfprint": em.audf_best(matcher, ht, em.array_hashes(an, seg), kinds)}
        if olaf:
            wf = os.path.join(tmp, "q%03d.wav" % n)
            em.write_wav(wf, audio16[int(s * em.OLAF_SR): int((s + 10) * em.OLAF_SR)], em.OLAF_SR)
            files.append(wf)
            w["_wf"] = wf
        windows.append(w)
    if olaf:
        res = em.olaf_query_many(olaf, olaf_home, files)
        for w in windows:
            w["olaf"] = em.olaf_summarize(res.get(w.pop("_wf"), []), kinds)
    for w in windows:
        w["verdict"] = em.decide(w)
    return windows, em.merge_segments(windows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--index", required=True)
    p.add_argument("--catalog-dir", required=True)
    p.add_argument("--catalog-codes", required=True)
    p.add_argument("--foreign", required=True)
    p.add_argument("--noise", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--seed", type=int, default=1578)
    a = p.parse_args()
    rng = np.random.default_rng(a.seed)
    index, ht = em.load_index(a.index)
    kinds = {t["code"]: t["kind"] for t in index["tracks"] if t.get("status") == "ok"}
    olaf = em.olaf_bin(None) if index.get("olaf", {}).get("available") else None
    olaf_home = os.path.join(a.index, "olaf")
    if olaf:
        em.olaf_prepare_home(olaf_home)
    sr = 22050
    noises = [em.decode(n, sr) for n in a.noise.split(",")]
    queries = [("catalog", c, os.path.join(a.catalog_dir, c + ".wav")) for c in a.catalog_codes.split(",")]
    queries += [("foreign", os.path.basename(f), f) for f in a.foreign.split(",")]
    rows = []
    with tempfile.TemporaryDirectory(prefix="evid-bench-") as tmp:
        for kind, label, src in queries:
            full = em.decode(src, sr)
            dur = len(full) / sr
            for length in LENGTHS:
                for snr in SNRS:
                    start = float(rng.uniform(5, max(6, dur - length - 5)))
                    x = full[int(start * sr): int((start + length) * sr)]
                    x = fft_conv(x, rir(rng, sr))
                    bed = noise_bed(rng, noises, len(x), sr)
                    ps = np.mean(x ** 2)
                    pn = np.mean(bed ** 2) + 1e-12
                    mix = x + bed * np.sqrt(ps / (pn * 10 ** (snr / 10)))
                    tag = "%s_%d_%d" % (kind, int(length), int(snr))
                    frag = phone_chain(mix, sr, tmp, tag)
                    windows, segs = run_fragment(frag, index, ht, kinds, olaf, olaf_home, tmp)
                    best = max(segs, key=lambda s: (s["windows"], s["both"]), default=None)
                    cat_segs = [s for s in segs if s["kind"] == "catalog"]
                    row = {"kind": kind, "label": label, "length_s": length, "snr_db": snr,
                           "true_start_s": round(start, 2),
                           "best": best, "catalog_segments": cat_segs,
                           "windows": [{"a": (w["audfprint"][:1] or [None])[0], "o": (w.get("olaf") or [None])[0],
                                        "v": w["verdict"]} for w in windows]}
                    if kind == "catalog":
                        row["hit"] = bool(best and best["code"] == label and abs(best["track_pos_at_rec0_s"] - start) <= 1.5)
                        row["wrong_track"] = any(s["code"] != label for s in cat_segs)
                    else:
                        row["false_positive"] = bool(cat_segs)
                    rows.append(row)
                    print(json.dumps({k: row.get(k) for k in ("kind", "label", "length_s", "snr_db", "hit",
                                                              "wrong_track", "false_positive")}), flush=True)
    em.write_json(a.out, {"seed": a.seed, "index": index.get("version"), "rows": rows})


if __name__ == "__main__":
    main()
