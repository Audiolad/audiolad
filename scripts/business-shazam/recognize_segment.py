#!/usr/bin/env python3
"""t1485u: recognise ONE audio segment with shazamio and print one JSON line.

Called by the PM2 worker audiolad-business-shazam-worker (scripts/run-business-shazam-worker.mts)
from its own venv (BUSINESS_SHAZAM_PYTHON, default /var/lib/audiolad/business-shazam/.venv/bin/python).
Pacing (>= 5 s between requests) and exponential backoff on HTTP 429 live in the worker;
this helper makes exactly one recognition request and never retries 429 itself.

Usage: recognize_segment.py <segment.wav> [max_skew]
Output: {"ok", "library_version", "matched", "title", "artist", "timeskew", "frequencyskew",
         "rejected_*", "rate_limited", "error"}
No DB access, no secrets, the audio file is not modified.
"""
from __future__ import annotations

import asyncio
import json
import sys
from importlib import metadata
from typing import Any

DEFAULT_MAX_SKEW = 1e-3


def library_version() -> str | None:
    try:
        return f"shazamio {metadata.version('shazamio')}"
    except metadata.PackageNotFoundError:
        return None


def first_match_skew(answer: dict[str, Any]) -> tuple[float | None, float | None]:
    matches = answer.get("matches") or []
    if not matches or not isinstance(matches[0], dict):
        return None, None
    first = matches[0]
    ts, fs = first.get("timeskew"), first.get("frequencyskew")
    return (float(ts) if isinstance(ts, (int, float)) else None,
            float(fs) if isinstance(fs, (int, float)) else None)


def describe(answer: dict[str, Any] | None, raw: dict[str, Any] | None) -> dict[str, Any]:
    """Build the output from the filtered answer and the raw (pre-max_skew) answer."""
    answer = answer if isinstance(answer, dict) else {}
    raw = raw if isinstance(raw, dict) else answer
    out: dict[str, Any] = {
        "ok": True, "library_version": library_version(), "matched": False,
        "title": None, "artist": None, "timeskew": None, "frequencyskew": None,
        "rejected_title": None, "rejected_artist": None,
        "rejected_timeskew": None, "rejected_frequencyskew": None,
        "rate_limited": False, "error": None,
    }
    track = answer.get("track")
    if isinstance(track, dict) and track:
        out["matched"] = True
        out["title"] = track.get("title")
        out["artist"] = track.get("subtitle")
        out["timeskew"], out["frequencyskew"] = first_match_skew(answer)
        return out
    raw_track = raw.get("track")
    if isinstance(raw_track, dict) and raw_track:
        out["rejected_title"] = raw_track.get("title")
        out["rejected_artist"] = raw_track.get("subtitle")
        out["rejected_timeskew"], out["rejected_frequencyskew"] = first_match_skew(raw)
    return out


def failure(error: str, *, rate_limited: bool = False) -> dict[str, Any]:
    return {
        "ok": False, "library_version": library_version(), "matched": None,
        "title": None, "artist": None, "timeskew": None, "frequencyskew": None,
        "rejected_title": None, "rejected_artist": None,
        "rejected_timeskew": None, "rejected_frequencyskew": None,
        "rate_limited": rate_limited, "error": error[:300],
    }


async def recognize(path: str, max_skew: float) -> dict[str, Any]:
    from aiohttp_retry import ExponentialRetry
    from shazamio import Shazam
    from shazamio.client import HTTPClient
    from shazamio.exceptions import RateLimited

    captured: dict[str, Any] = {}

    class CapturingShazam(Shazam):
        # Keeps the raw answer so a candidate rejected by max_skew can be logged with its skew.
        async def send_recognize_request_v2(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
            answer = await super().send_recognize_request_v2(*args, **kwargs)
            captured["raw"] = answer
            return answer

    # 429 is not retried inside the library: the worker backs off itself (>= 5 s, doubling).
    client = HTTPClient(retry_options=ExponentialRetry(attempts=3, max_timeout=20, statuses={500, 502, 503, 504}))
    shazam = CapturingShazam(http_client=client)
    try:
        answer = await asyncio.wait_for(shazam.recognize(path, max_skew=max_skew), timeout=120)
    except RateLimited:
        return failure("rate_limited", rate_limited=True)
    except asyncio.TimeoutError:
        return failure("timeout")
    except Exception as exc:  # noqa: BLE001 - reported to the worker as a segment error
        text = str(exc)
        if " 429" in text or "429 " in text:
            return failure("rate_limited", rate_limited=True)
        return failure(f"{type(exc).__name__}: {text}")
    finally:
        close = getattr(client, "close", None)
        if close is not None:
            try:
                result = close()
                if asyncio.iscoroutine(result):
                    await result
            except Exception:  # noqa: BLE001
                pass
    return describe(answer, captured.get("raw"))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(json.dumps(failure("usage: recognize_segment.py <segment.wav> [max_skew]")))
        return 2
    max_skew = float(argv[2]) if len(argv) > 2 else DEFAULT_MAX_SKEW
    if not max_skew > 0:
        print(json.dumps(failure("max_skew must be above 0")))
        return 2
    try:
        result = asyncio.run(recognize(argv[1], max_skew))
    except ModuleNotFoundError as exc:
        result = failure(f"shazamio_not_installed: {exc.name}")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
