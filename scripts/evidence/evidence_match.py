#!/usr/bin/env python3
"""AudioLad evidence matcher (t1578u).

Сверка записи инспектора с закрытым каталогом АудиоЛада.

Два независимых метода «созвездных» отпечатков:
  * audfprint (Dan Ellis, MIT, vendored at a pinned commit) – основной;
  * Olaf (Joren Six, AGPL-3.0, pinned release binary) – перепроверка.

Commands
  build  – build a new index version from a JSON manifest of reference tracks
           (catalog + control music). Each entry: {code, kind, path|url, sha256?, title?}.
  match  – split a recording into overlapping windows and match each window.
  selftest – tiny synthetic check that the toolchain works (no catalog needed).

Everything heavy is expected to run under `nice -n 19 ionice -c3` (the Node caller adds it).
No network access except downloading reference files from the URLs in the build manifest.
Pure audio: the play-log comparison is done by the caller.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import gzip
import datetime as _dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "vendor", "audfprint"))

import numpy as np  # noqa: E402

import audfprint_analyze  # noqa: E402
import audfprint_match  # noqa: E402
import hash_table  # noqa: E402

ENGINE_VERSION = "t1578u-2"
SR = 11025
# Memory bounds on the shared production host (float32 at 11.025 + 16 kHz ≈ 0.11 GB per hour).
MATCH_MAX_DURATION_S = 2 * 3600
REF_MAX_DURATION_S = 90 * 60
OLAF_SR = 16000
# audfprint parameters (match = density/peaks/fanout of the store; shifts 1 for store, 4 for query).
DENSITY = 20.0
HASHBITS = 20
DEPTH = 20
# Time field of the audfprint hash entries: 2^18 frames of 256 samples at 11025 Hz = 101 min, which
# covers REF_MAX_DURATION_S (positions beyond it would wrap). The rest of the 32-bit entry is the
# track id: up to 2^14 − 1 = 16383 reference tracks per index.
MAXTIME = 1 << 18
MAX_REF_TRACKS = (1 << (32 - 18)) - 1
FANOUT = 3
PKS_PER_FRAME = 5
FREQ_SD = 30.0
MATCH_WIN = 2
# Decision thresholds (calibrated on the noisy-fragment test, see docs/business/evidence-matching.md).
AUDFPRINT_MIN_ALIGNED = 10  # t1578u benchmark: in-catalog look-alikes reach 9, foreign 0
OLAF_MIN_COUNT = 12  # t1578u benchmark: impostors reach 10
OFFSET_TOLERANCE_S = 1.5
T_HOP = 256 / SR
assert REF_MAX_DURATION_S / T_HOP < MAXTIME, "reference cap must fit the audfprint time field"


def log(msg: str) -> None:
    sys.stderr.write("[evidence] %s\n" % msg)
    sys.stderr.flush()


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def decode(path: str, sr: int, start: float | None = None, duration: float | None = None) -> np.ndarray:
    cmd = ["ffmpeg", "-v", "error", "-nostdin"]
    if start is not None:
        cmd += ["-ss", "%.3f" % start]
    cmd += ["-i", path, "-vn", "-ac", "1", "-ar", str(sr)]
    if duration is not None:
        cmd += ["-t", "%.3f" % duration]
    cmd += ["-f", "f32le", "-"]
    out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if out.returncode != 0:
        raise RuntimeError("ffmpeg_decode_failed: %s" % out.stderr.decode("utf-8", "replace")[-400:])
    # float32 view on ffmpeg's buffer: no float64 copy (memory is bounded by the duration caps).
    return np.frombuffer(out.stdout, dtype=np.float32)


class RecordingTooLong(RuntimeError):
    """The recording is longer than MATCH_MAX_DURATION_S (memory bound for the shared host)."""


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if out.returncode != 0:
        return {}
    try:
        data = json.loads(out.stdout.decode("utf-8", "replace"))
    except ValueError:
        return {}
    fmt = data.get("format") or {}
    tags = {k.lower(): v for k, v in (fmt.get("tags") or {}).items()}
    for stream in data.get("streams") or []:
        for k, v in (stream.get("tags") or {}).items():
            tags.setdefault(k.lower(), v)
    keep = {k: tags[k] for k in ("creation_time", "com.apple.quicktime.creationdate", "date", "encoder",
                                  "com.android.version", "com.apple.quicktime.make", "com.apple.quicktime.model",
                                  "make", "model", "location", "com.apple.quicktime.location.iso6709") if k in tags}
    return {
        "format_name": fmt.get("format_name"),
        "duration_s": float(fmt["duration"]) if fmt.get("duration") else None,
        "size_bytes": int(fmt["size"]) if fmt.get("size") else None,
        "tags": keep,
        "streams": [
            {"codec_type": s.get("codec_type"), "codec_name": s.get("codec_name"),
             "sample_rate": s.get("sample_rate"), "channels": s.get("channels")}
            for s in data.get("streams") or []
        ],
    }


def make_analyzer(shifts: int) -> "audfprint_analyze.Analyzer":
    an = audfprint_analyze.Analyzer()
    an.density = DENSITY
    an.maxpksperframe = PKS_PER_FRAME
    an.maxpairsperpeak = FANOUT
    an.f_sd = FREQ_SD
    an.shifts = shifts
    an.target_sr = SR
    an.n_fft = 512
    an.n_hop = 256
    an.fail_on_error = True
    return an


def array_hashes(an, d: np.ndarray) -> np.ndarray:
    if len(d) < an.n_fft * 4:
        return np.zeros((0, 2), dtype=np.int32)
    lists = []
    shifts = max(1, int(an.shifts))
    for shift in range(shifts):
        samps = int(shift / shifts * an.n_hop)
        peaks = an.find_peaks(d[samps:], SR)
        if len(peaks):
            lms = an.peaks2landmarks(peaks)
            if len(lms):
                lists.append(audfprint_analyze.landmarks2hashes(lms))
    if not lists:
        return np.zeros((0, 2), dtype=np.int32)
    qh = np.concatenate(lists)
    hh = (qh[:, 0].astype(np.uint64) << np.uint64(32)) + qh[:, 1].astype(np.uint64)
    u = np.sort(np.unique(hh))
    return np.hstack([(u >> np.uint64(32))[:, None], (u & np.uint64((1 << 32) - 1))[:, None]]).astype(np.int32)


def make_matcher() -> "audfprint_match.Matcher":
    m = audfprint_match.Matcher()
    m.window = MATCH_WIN
    m.threshcount = 5
    m.max_returns = 3
    m.search_depth = 100
    m.exact_count = True
    m.find_time_range = True
    m.time_quantile = 0.05
    return m


# ---------------------------------------------------------------- Olaf

def olaf_env(olaf_home: str) -> dict:
    env = dict(os.environ)
    env["HOME"] = olaf_home
    return env


def olaf_prepare_home(olaf_home: str) -> None:
    cfg_dir = os.path.join(olaf_home, ".olaf")
    os.makedirs(os.path.join(cfg_dir, "db"), exist_ok=True)
    os.makedirs(os.path.join(cfg_dir, "cache"), exist_ok=True)
    with open(os.path.join(cfg_dir, "olaf_config.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "db_folder": os.path.join(cfg_dir, "db") + "/",
            "cache_folder": os.path.join(cfg_dir, "cache") + "/",
            "skip_duplicates": False,
            "verbose": False,
        }, fh)


def olaf_bin(explicit: str | None) -> str | None:
    cand = explicit or os.environ.get("EVIDENCE_OLAF_BIN") or ""
    if cand and os.access(cand, os.X_OK):
        return cand
    found = shutil.which("olaf")
    return found


def olaf_version(binary: str | None) -> str | None:
    if not binary:
        return None
    try:
        out = subprocess.run([binary, "--help"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
        first = out.stdout.decode("utf-8", "replace").splitlines()[0]
        return first.strip()[:120]
    except Exception:  # pragma: no cover - environment specific
        return None


def write_wav(path: str, d: np.ndarray, sr: int) -> None:
    pcm = np.clip(d, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def parse_json_stream(text: str) -> list:
    dec = json.JSONDecoder()
    i, n, items = 0, len(text), []
    while i < n:
        while i < n and text[i] in " \r\n\t,":
            i += 1
        if i >= n:
            break
        if text[i] not in "{[":
            nl = text.find("\n", i)
            i = n if nl < 0 else nl + 1
            continue
        try:
            obj, j = dec.raw_decode(text, i)
        except ValueError:
            nl = text.find("\n", i)
            i = n if nl < 0 else nl + 1
            continue
        if isinstance(obj, list):
            items.extend(obj)
        else:
            items.append(obj)
        i = j
    return items


def olaf_store(binary: str, olaf_home: str, path: str, ident: str) -> None:
    out = subprocess.run([binary, "store", "--threads", "1", "--with-ids", path, ident],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=olaf_env(olaf_home), timeout=900)
    if out.returncode != 0:
        raise RuntimeError("olaf_store_failed: %s" % out.stderr.decode("utf-8", "replace")[-300:])


def olaf_query_many(binary: str, olaf_home: str, files: list[str]) -> dict:
    """Return {path: [matches]} for many window files in one Olaf run."""
    result: dict = {f: [] for f in files}
    if not files:
        return result
    out = subprocess.run([binary, "query", "--threads", "1", "--format", "json", *files],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=olaf_env(olaf_home), timeout=1800)
    if out.returncode != 0:
        raise RuntimeError("olaf_query_failed: %s" % out.stderr.decode("utf-8", "replace")[-300:])
    for item in parse_json_stream(out.stdout.decode("utf-8", "replace")):
        if not isinstance(item, dict):
            continue
        qp = item.get("query_path")
        key = qp if qp in result else next((f for f in files if qp and os.path.abspath(f) == os.path.abspath(qp)), None)
        if key is None:
            continue
        for m in item.get("matches") or []:
            result[key].append(m)
    return result


# ---------------------------------------------------------------- heavy-job lock

class HeavyLock:
    """One heavy job (index build or match) at a time on the host: an exclusive flock(2) on a
    lock file that is never deleted. The kernel drops the lock when the holder exits or is killed,
    so there is no stale-lock takeover and no window between creating the file and owning it.
    Waits instead of failing."""

    def __init__(self, path: str | None, status_path: str | None = None, wait_s: float = 4 * 3600,
                 status_extra: dict | None = None):
        self.path, self.status_path, self.wait_s, self.held = path, status_path, wait_s, False
        self.status_extra = status_extra or {}
        self.fd = None

    def __enter__(self):
        if not self.path:
            return self
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR | getattr(os, "O_CLOEXEC", 0), 0o600)
        deadline = time.time() + self.wait_s
        announced = False
        try:
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.time() > deadline:
                        raise RuntimeError("heavy_lock_timeout")
                    if self.status_path and not announced:
                        write_json(self.status_path, {**self.status_extra, "state": "waiting", "since": now_iso(),
                                                      "startedAt": now_iso(), "pid": os.getpid()})
                        announced = True
                    time.sleep(5)
        except BaseException:
            os.close(fd)
            raise
        # Informational only: who holds the lock.
        os.ftruncate(fd, 0)
        os.pwrite(fd, ("%d %s\n" % (os.getpid(), now_iso())).encode(), 0)
        self.fd, self.held = fd, True
        return self

    def __exit__(self, *exc):
        if self.held and self.fd is not None:
            try:
                fcntl.flock(self.fd, fcntl.LOCK_UN)
            finally:
                os.close(self.fd)
            self.fd, self.held = None, False
        return False


VERSION_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$")


def prune_versions(versions_dir: str, keep: str | None) -> None:
    """Only called while holding the heavy lock. Removes *.partial leftovers; when `keep` (the
    version just activated) is given, keeps it and the newest other version and removes the rest."""
    try:
        names = os.listdir(versions_dir)
    except FileNotFoundError:
        return
    for n in names:
        if n.endswith(".partial") and VERSION_RE.match(n[: -len(".partial")]):
            shutil.rmtree(os.path.join(versions_dir, n), ignore_errors=True)
    if keep is None:
        return
    keep = os.path.realpath(keep)
    others = sorted((n for n in names if VERSION_RE.match(n) and os.path.isdir(os.path.join(versions_dir, n))
                     and os.path.realpath(os.path.join(versions_dir, n)) != keep), reverse=True)
    for n in others[1:]:
        shutil.rmtree(os.path.join(versions_dir, n), ignore_errors=True)


def activate_link(link: str, target: str) -> None:
    """Atomically points `link` (a symlink) at `target`."""
    tmp = "%s.new-%d" % (link, os.getpid())
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    os.symlink(target, tmp)
    os.replace(tmp, link)


# ---------------------------------------------------------------- build

def fetch_reference(entry: dict, tmpdir: str) -> tuple[str, bool]:
    if entry.get("path"):
        return entry["path"], False
    url = entry.get("url")
    if not url:
        raise RuntimeError("reference_without_source:%s" % entry.get("code"))
    dest = os.path.join(tmpdir, "ref.bin")
    req = urllib.request.Request(url, headers={"User-Agent": "AudioLad-evidence-matcher/1"})
    with urllib.request.urlopen(req, timeout=600) as resp, open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh, 1 << 20)
    return dest, True


def cmd_build(args) -> int:
    try:
        with open(args.manifest, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
    finally:
        if args.delete_manifest:
            # The manifest holds short-lived signed download URLs: never keep it on disk.
            try:
                os.unlink(args.manifest)
            except FileNotFoundError:
                pass
    try:
        with HeavyLock(args.lock, args.status):
            return _build(args, manifest)
    except Exception as exc:  # noqa: BLE001 - reported to the status file, never with URLs
        if args.status:
            write_json(args.status, {"state": "failed", "error": type(exc).__name__, "at": now_iso()})
        log("build_failed %s" % type(exc).__name__)
        return 1


def _build(args, manifest) -> int:
    entries = manifest.get("tracks") or []
    if not entries:
        log("build_empty_manifest")
        return 2
    if len(entries) > MAX_REF_TRACKS:
        log("build_too_many_tracks %d" % len(entries))
        return 2
    out_dir = os.path.abspath(args.out)
    if os.path.exists(out_dir):
        log("build_out_exists")
        return 2
    work = out_dir + ".partial"
    if args.prune:
        # Under the heavy lock no other build runs: leftovers of crashed builds can go.
        prune_versions(os.path.dirname(out_dir), keep=None)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    olaf = olaf_bin(args.olaf)
    olaf_home = os.path.join(work, "olaf")
    if olaf:
        olaf_prepare_home(olaf_home)
    an = make_analyzer(1)
    ht = hash_table.HashTable(hashbits=HASHBITS, depth=DEPTH, maxtime=MAXTIME)
    tracks = []
    status_path = args.status
    started = time.time()
    started_iso = now_iso()
    if status_path:
        write_json(status_path, {"state": "running", "done": 0, "total": len(entries), "pid": os.getpid(),
                                 "startedAt": started_iso})
    for i, entry in enumerate(entries):
        code = str(entry.get("code") or "").strip()
        kind = entry.get("kind") if entry.get("kind") in ("catalog", "control") else "catalog"
        if not code:
            continue
        with tempfile.TemporaryDirectory(prefix="evid-ref-") as tmp:
            src, downloaded = fetch_reference(entry, tmp)
            digest = sha256_file(src)
            expected = (entry.get("sha256") or "").lower()
            if expected and expected != digest:
                tracks.append({"code": code, "kind": kind, "title": entry.get("title"), "status": "sha256_mismatch",
                               "sha256": digest, "expected_sha256": expected})
                log("build_sha256_mismatch code=%s" % code)
                continue
            d = decode(src, SR, duration=REF_MAX_DURATION_S)
            hashes = array_hashes(an, d)
            ht.store(code, hashes)
            if olaf:
                wav = os.path.join(tmp, "ref.wav")
                write_wav(wav, decode(src, OLAF_SR, duration=REF_MAX_DURATION_S), OLAF_SR)
                olaf_store(olaf, olaf_home, wav, code)
            tracks.append({"code": code, "kind": kind, "title": entry.get("title"), "status": "ok",
                           "sha256": digest, "sha256_verified": bool(expected),
                           "duration_s": round(len(d) / SR, 3), "hashes": int(len(hashes)),
                           "source": "download" if downloaded else "file"})
        if status_path:
            write_json(status_path, {"state": "running", "done": i + 1, "total": len(entries),
                                     "elapsed_s": round(time.time() - started, 1), "pid": os.getpid(),
                                     "startedAt": started_iso})
    ht.params = {"samplerate": SR, "density": DENSITY}
    pklz = os.path.join(work, "audfprint.pklz")
    # audfprint's save() leaves its gzip file open (closed only by garbage collection); on
    # Python 3.12 that produced a truncated index. Own the file, close and fsync it, then check
    # that the whole gzip stream reads back before the version can be activated.
    with open(pklz, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb") as gz, \
            contextlib.redirect_stdout(sys.stderr):
        ht.save(pklz, file_object=gz)
    with open(pklz, "rb") as raw:
        os.fsync(raw.fileno())
    with gzip.open(pklz, "rb") as gz:
        while gz.read(1 << 20):
            pass
    ok = [t for t in tracks if t["status"] == "ok"]
    index = {
        "engine_version": ENGINE_VERSION,
        "built_at": now_iso(),
        "version": args.version or os.path.basename(out_dir),
        "audfprint": {"commit": "cb03ba99feafd41b8874307f0f4e808a6ce34362", "density": DENSITY, "hashbits": HASHBITS,
                      "depth": DEPTH, "maxtime": MAXTIME, "fanout": FANOUT, "pks_per_frame": PKS_PER_FRAME,
                      "samplerate": SR, "file_sha256": sha256_file(os.path.join(work, "audfprint.pklz"))},
        "olaf": {"available": bool(olaf), "version": olaf_version(olaf)},
        "counts": {"catalog": sum(1 for t in ok if t["kind"] == "catalog"),
                   "control": sum(1 for t in ok if t["kind"] == "control"),
                   "failed": len(tracks) - len(ok)},
        "tracks": tracks,
    }
    write_json(os.path.join(work, "index.json"), index)
    os.rename(work, out_dir)
    if args.activate_link:
        activate_link(args.activate_link, out_dir)
    if args.prune:
        prune_versions(os.path.dirname(out_dir), keep=out_dir)
    if status_path:
        write_json(status_path, {"state": "done", "done": len(entries), "total": len(entries),
                                 "elapsed_s": round(time.time() - started, 1), "index": index["version"]})
    print(json.dumps({"ok": True, "version": index["version"], "counts": index["counts"]}))
    return 0


def write_json(path: str, data) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


# ---------------------------------------------------------------- match

def load_index(index_dir: str) -> tuple[dict, "hash_table.HashTable"]:
    with open(os.path.join(index_dir, "index.json"), "r", encoding="utf-8") as fh:
        index = json.load(fh)
    with contextlib.redirect_stdout(sys.stderr):
        ht = hash_table.HashTable(os.path.join(index_dir, "audfprint.pklz"))
    return index, ht


def build_extra_refs(extras: list, olaf: str | None, tmp: str):
    """Small throw-away index of the songs named in the claim (negative control)."""
    if not extras:
        return None, None, []
    an = make_analyzer(1)
    ht = hash_table.HashTable(hashbits=HASHBITS, depth=DEPTH, maxtime=MAXTIME)
    home = os.path.join(tmp, "olaf-extra")
    if olaf:
        olaf_prepare_home(home)
    info = []
    for n, item in enumerate(extras):
        path, label = item
        code = "EXTRA-%d" % (n + 1)
        d = decode(path, SR, duration=REF_MAX_DURATION_S)
        ht.store(code, array_hashes(an, d))
        if olaf:
            wav = os.path.join(tmp, "extra-%d.wav" % n)
            write_wav(wav, decode(path, OLAF_SR, duration=REF_MAX_DURATION_S), OLAF_SR)
            olaf_store(olaf, home, wav, code)
        info.append({"code": code, "kind": "claimed", "title": label, "sha256": sha256_file(path),
                     "duration_s": round(len(d) / SR, 3)})
    return ht, (home if olaf else None), info


def audf_best(matcher, ht, hashes, names_kind) -> list:
    if len(hashes) == 0:
        return []
    rows = matcher.match_hashes(ht, hashes)
    res = []
    for row in rows[:3]:
        tid, aligned, align_t, raw, _rank = int(row[0]), int(row[1]), int(row[2]), int(row[3]), int(row[4])
        name = ht.names[tid]
        res.append({"code": name, "kind": names_kind.get(name, "catalog"), "aligned": aligned, "raw": raw,
                    "track_pos_s": round(align_t * T_HOP, 2)})
    return res


def cmd_match(args) -> int:
    try:
        with HeavyLock(args.lock, args.status):
            if args.status:
                write_json(args.status, {"state": "running", "since": now_iso(), "startedAt": now_iso(),
                                         "pid": os.getpid()})
            rc = _match(args)
        if args.status:
            write_json(args.status, {"state": "done" if rc == 0 else "failed", "at": now_iso()})
        return rc
    except Exception as exc:  # noqa: BLE001
        if args.status:
            write_json(args.status, {"state": "failed", "error": type(exc).__name__, "at": now_iso()})
        log("match_failed %s" % type(exc).__name__)
        return 1


def _match(args) -> int:
    started = time.time()
    args.index = os.path.realpath(args.index)  # pin the version even if `current` is swapped meanwhile
    index, ht = load_index(args.index)
    kinds = {t["code"]: t["kind"] for t in index.get("tracks", []) if t.get("status") == "ok"}
    olaf = olaf_bin(args.olaf) if index.get("olaf", {}).get("available") else None
    olaf_home = os.path.join(args.index, "olaf")
    if olaf:
        olaf_prepare_home(olaf_home)  # rewrite the config: the index folder may have been renamed
    inp = args.input
    meta = probe(inp)
    if (meta.get("duration_s") or 0) > MATCH_MAX_DURATION_S:
        raise RecordingTooLong()
    audio = decode(inp, SR, duration=MATCH_MAX_DURATION_S + 1)
    if len(audio) > MATCH_MAX_DURATION_S * SR:
        raise RecordingTooLong()
    dur = len(audio) / SR
    window, hop = float(args.window), float(args.hop)
    starts = []
    t = 0.0
    while t + min(window, 5.0) <= dur + 1e-6:
        starts.append(round(t, 3))
        t += hop
    if not starts and dur >= 3.0:
        starts = [0.0]
    an = make_analyzer(4)
    matcher = make_matcher()
    extras = []
    for spec in args.extra or []:
        path, _, label = spec.partition("::")
        extras.append((path, label or os.path.basename(path)))
    with tempfile.TemporaryDirectory(prefix="evid-match-") as tmp:
        x_ht, x_home, x_info = build_extra_refs(extras, olaf, tmp)
        x_kinds = {i["code"]: "claimed" for i in x_info}
        windows = []
        olaf_files = []
        audio16 = decode(inp, OLAF_SR, duration=MATCH_MAX_DURATION_S + 1) if olaf else None
        for n, s in enumerate(starts):
            seg = audio[int(s * SR): int((s + window) * SR)]
            hashes = array_hashes(an, seg)
            item = {"n": n, "rec_from_s": s, "rec_to_s": round(min(s + window, dur), 3), "query_hashes": int(len(hashes)),
                    "rms_dbfs": round(float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12)), 1) if len(seg) else None,
                    "audfprint": audf_best(matcher, ht, hashes, kinds)}
            if x_ht is not None:
                item["audfprint_claimed"] = audf_best(matcher, x_ht, hashes, x_kinds)
            if olaf:
                wf = os.path.join(tmp, "w%05d.wav" % n)
                write_wav(wf, audio16[int(s * OLAF_SR): int((s + window) * OLAF_SR)], OLAF_SR)
                olaf_files.append(wf)
                item["_wf"] = wf
            windows.append(item)
        if olaf:
            res = olaf_query_many(olaf, olaf_home, olaf_files)
            res_x = olaf_query_many(olaf, x_home, olaf_files) if x_home else {}
            for w in windows:
                w["olaf"] = olaf_summarize(res.get(w["_wf"], []), kinds)
                if x_home:
                    w["olaf_claimed"] = olaf_summarize(res_x.get(w["_wf"], []), x_kinds)
        for w in windows:
            w.pop("_wf", None)
            w["verdict"] = decide(w)
            if x_ht is not None:
                w["claimed_verdict"] = decide({"audfprint": w.get("audfprint_claimed") or [],
                                               "olaf": w.get("olaf_claimed") or []})
    segments = merge_segments(windows)
    if x_ht is not None:
        # The claimant's track is matched against its own index; keep its time ranges too.
        segments = sorted(segments + merge_segments(windows, "claimed_verdict", "claimed"),
                          key=lambda g: (g["rec_from_s"], g["kind"] != "catalog"))
    summary = summarize(windows, segments)
    result = {
        "engine_version": ENGINE_VERSION,
        "created_at": now_iso(),
        "elapsed_s": round(time.time() - started, 2),
        "input": {"name": os.path.basename(inp), "sha256": sha256_file(inp), "size_bytes": os.path.getsize(inp),
                  "decoded_duration_s": round(dur, 3), "probe": meta},
        "index": {"version": index.get("version"), "built_at": index.get("built_at"),
                  "audfprint_sha256": index.get("audfprint", {}).get("file_sha256"),
                  "counts": index.get("counts"), "olaf": index.get("olaf")},
        "params": {"window_s": window, "hop_s": hop, "audfprint_min_aligned": AUDFPRINT_MIN_ALIGNED,
                   "olaf_min_count": OLAF_MIN_COUNT, "offset_tolerance_s": OFFSET_TOLERANCE_S},
        "claimed_refs": x_info,
        "windows": windows,
        "segments": segments,
        "summary": summary,
    }
    write_json(args.out, result)
    print(json.dumps({"ok": True, "windows": len(windows), "segments": len(segments), "summary": summary},
                     ensure_ascii=False))
    return 0


def olaf_summarize(matches: list, kinds: dict) -> list:
    out = []
    for m in sorted(matches, key=lambda x: -int(x.get("match_count") or 0))[:3]:
        code = str(m.get("path") or "")
        qs = float(m.get("query_start") or 0.0)
        rs = float(m.get("reference_start") or 0.0)
        out.append({"code": code, "kind": kinds.get(code, "catalog"), "count": int(m.get("match_count") or 0),
                    "track_pos_s": round(rs - qs, 2), "query_from_s": round(qs, 2),
                    "query_to_s": round(float(m.get("query_stop") or 0.0), 2)})
    return out


def decide(w: dict) -> dict:
    a = next((r for r in w.get("audfprint") or [] if r["aligned"] >= AUDFPRINT_MIN_ALIGNED), None)
    o = next((r for r in w.get("olaf") or [] if r["count"] >= OLAF_MIN_COUNT), None)
    if a and o and a["code"] == o["code"] and abs(a["track_pos_s"] - o["track_pos_s"]) <= OFFSET_TOLERANCE_S:
        return {"status": "both", "code": a["code"], "kind": a["kind"], "track_pos_s": a["track_pos_s"]}
    if a and o and a["code"] == o["code"]:
        # Same track, contradicting positions: not evidence, excluded from segments.
        return {"status": "conflict", "code": a["code"], "kind": a["kind"], "track_pos_s": a["track_pos_s"],
                "other_code": o["code"], "other_track_pos_s": o["track_pos_s"], "reason": "position"}
    if a and o and a["code"] != o["code"]:
        return {"status": "conflict", "code": a["code"], "kind": a["kind"], "track_pos_s": a["track_pos_s"],
                "other_code": o["code"]}
    if a:
        return {"status": "audfprint", "code": a["code"], "kind": a["kind"], "track_pos_s": a["track_pos_s"]}
    if o:
        return {"status": "olaf", "code": o["code"], "kind": o["kind"], "track_pos_s": o["track_pos_s"]}
    return {"status": "none"}


def merge_segments(windows: list, key: str = "verdict", kind: str | None = None) -> list:
    """Joins consecutive windows with the same track and track offset. `key` picks the verdict
    (catalog index or the claimant's track); `kind` overrides the segment kind."""
    segs: list = []
    for w in windows:
        v = w.get(key) or {"status": "none"}
        if v["status"] in ("none", "conflict"):
            continue
        if kind:
            v = {**v, "kind": kind}
        base = v["track_pos_s"] - w["rec_from_s"]  # track position at recording time 0
        last = segs[-1] if segs else None
        if (last and last["code"] == v["code"] and abs(last["_base"] - base) <= OFFSET_TOLERANCE_S
                and w["rec_from_s"] <= last["rec_to_s"] + 0.01):
            last["rec_to_s"] = w["rec_to_s"]
            last["windows"] += 1
            last["both"] += 1 if v["status"] == "both" else 0
            last["track_to_s"] = round(base + w["rec_to_s"], 2)
            continue
        segs.append({"code": v["code"], "kind": v["kind"], "rec_from_s": w["rec_from_s"], "rec_to_s": w["rec_to_s"],
                     "track_from_s": round(v["track_pos_s"], 2), "track_to_s": round(base + w["rec_to_s"], 2),
                     "windows": 1, "both": 1 if v["status"] == "both" else 0, "_base": base})
    for s in segs:
        s["track_pos_at_rec0_s"] = round(s.pop("_base"), 2)
        s["confidence"] = "high" if s["both"] >= 2 or (s["both"] >= 1 and s["windows"] >= 2) else (
            "medium" if s["both"] >= 1 or s["windows"] >= 2 else "low")
    return segs


def summarize(windows: list, segments: list) -> dict:
    total = len(windows)
    by = {"catalog": 0, "control": 0, "none": 0, "conflict": 0}
    for w in windows:
        v = w["verdict"]
        if v["status"] == "none":
            by["none"] += 1
        elif v["status"] == "conflict":
            by["conflict"] += 1
        else:
            by[v["kind"] if v["kind"] in by else "catalog"] += 1
    claimed = sum(1 for w in windows if (w.get("claimed_verdict") or {}).get("status") in ("both", "audfprint", "olaf"))
    return {"windows": total, "catalog_windows": by["catalog"], "control_windows": by["control"],
            "unmatched_windows": by["none"], "conflict_windows": by["conflict"], "claimed_windows": claimed,
            "catalog_tracks": sorted({s["code"] for s in segments if s["kind"] == "catalog"})}


# ---------------------------------------------------------------- selftest

def cmd_selftest(args) -> int:
    rng = np.random.default_rng(1578)
    with tempfile.TemporaryDirectory(prefix="evid-self-") as tmp:
        refs = []
        for n in range(3):
            t = np.arange(int(SR * 40)) / SR
            sig = np.zeros_like(t)
            for k in range(160):
                m = (t >= k * 0.25) & (t < (k + 1) * 0.25)
                for f in rng.uniform(150, 4000, size=4):
                    sig[m] += 0.12 * np.sin(2 * np.pi * f * t[m])
            p = os.path.join(tmp, "ref%d.wav" % n)
            write_wav(p, sig, SR)
            refs.append(p)
        man = os.path.join(tmp, "m.json")
        write_json(man, {"tracks": [{"code": "AL-T-SELF-%d" % n, "kind": "catalog", "path": p} for n, p in enumerate(refs)]})
        vdir = os.path.join(tmp, "versions")
        os.makedirs(vdir)
        for old in ("20200101-000000-00000001", "20200101-000000-00000002"):
            os.makedirs(os.path.join(vdir, old))
        idx = os.path.join(vdir, "20200101-000000-0000000f")
        link = os.path.join(tmp, "current")
        lock = os.path.join(tmp, "locks", "heavy.lock")
        os.makedirs(os.path.join(vdir, "20200101-000000-00000003.partial"))
        ns = argparse.Namespace(manifest=man, out=idx, olaf=args.olaf, status=None, version="selftest",
                                lock=lock, activate_link=link, delete_manifest=True, prune=True)
        if (cmd_build(ns) != 0 or os.path.exists(man) or os.path.realpath(link) != os.path.realpath(idx)
                or sorted(os.listdir(vdir)) != ["20200101-000000-00000002", "20200101-000000-0000000f"]):
            print(json.dumps({"selftest": "fail", "stage": "build"}))
            return 1
        q = decode(refs[1], SR)[int(12 * SR): int(24 * SR)]
        q = q + 0.05 * rng.standard_normal(len(q))
        qp = os.path.join(tmp, "q.wav")
        write_wav(qp, q, SR)
        out = os.path.join(tmp, "r.json")
        st = os.path.join(tmp, "match-status.json")
        cmd_match(argparse.Namespace(index=link, input=qp, out=out, window=10, hop=5, olaf=args.olaf, extra=[],
                                     lock=lock, status=st))
        probe_fd = os.open(lock, os.O_RDWR)
        try:
            fcntl.flock(probe_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)  # must be free after the jobs
            fcntl.flock(probe_fd, fcntl.LOCK_UN)
        except BlockingIOError:
            print(json.dumps({"selftest": "fail", "stage": "lock_left"}))
            return 1
        finally:
            os.close(probe_fd)
        try:
            with HeavyLock(lock):
                with HeavyLock(lock, wait_s=0):
                    print(json.dumps({"selftest": "fail", "stage": "lock_not_exclusive"}))
                    return 1
        except RuntimeError as exc:
            if str(exc) != "heavy_lock_timeout":
                raise
        with open(out, encoding="utf-8") as fh:
            r = json.load(fh)
        segs = r["segments"]
        ok = bool(segs) and segs[0]["code"] == "AL-T-SELF-1" and abs(segs[0]["track_from_s"] - 12.0) < 1.0
        # A conflicting claimed window is not counted as the claimant's track being heard.
        ok = ok and summarize([{"verdict": {"status": "none"}, "claimed_verdict": {"status": "conflict"}}], [])[
            "claimed_windows"] == 0
        print(json.dumps({"selftest": "ok" if ok else "fail", "segments": segs}, ensure_ascii=False))
        return 0 if ok else 1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="AudioLad evidence matcher")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--manifest", required=True)
    b.add_argument("--out", required=True)
    b.add_argument("--olaf")
    b.add_argument("--status")
    b.add_argument("--version")
    b.add_argument("--lock")
    b.add_argument("--prune", action="store_true", help="under the lock: drop .partial leftovers, keep active + one")
    b.add_argument("--activate-link")
    b.add_argument("--delete-manifest", action="store_true")
    m = sub.add_parser("match")
    m.add_argument("--index", required=True)
    m.add_argument("--input", required=True)
    m.add_argument("--out", required=True)
    m.add_argument("--window", type=float, default=10.0)
    m.add_argument("--hop", type=float, default=5.0)
    m.add_argument("--olaf")
    m.add_argument("--extra", action="append", help="path::label of a song named in the claim")
    m.add_argument("--lock")
    m.add_argument("--status")
    s = sub.add_parser("selftest")
    s.add_argument("--olaf")
    args = p.parse_args(argv)
    if args.cmd == "build":
        return cmd_build(args)
    if args.cmd == "match":
        return cmd_match(args)
    return cmd_selftest(args)


if __name__ == "__main__":
    sys.exit(main())
