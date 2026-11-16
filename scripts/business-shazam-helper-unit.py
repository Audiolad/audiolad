#!/usr/bin/env python3
"""t1485u: offline unit test of scripts/business-shazam/recognize_segment.py (no network, no shazamio needed)."""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
path = root / 'scripts/business-shazam/recognize_segment.py'
spec = importlib.util.spec_from_file_location('recognize_segment', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

track = {'title': 'Song', 'subtitle': 'Band'}
skewed = {'matches': [{'timeskew': 0.0302, 'frequencyskew': 0.0323}], 'track': track}
rejected = {'matches': []}
out = mod.describe(rejected, skewed)
assert out['ok'] is True and out['matched'] is False, out
assert out['title'] is None and out['rejected_title'] == 'Song' and out['rejected_timeskew'] == 0.0302, out

kept = {'matches': [{'timeskew': 0.0004, 'frequencyskew': -0.0002}], 'track': track}
out = mod.describe(kept, kept)
assert out['matched'] is True and out['title'] == 'Song' and out['artist'] == 'Band' and out['timeskew'] == 0.0004, out

out = mod.describe({'matches': []}, None)
assert out['matched'] is False and out['rejected_title'] is None, out

fail = mod.failure('rate_limited', rate_limited=True)
assert fail['ok'] is False and fail['rate_limited'] is True and fail['matched'] is None, fail
assert mod.DEFAULT_MAX_SKEW == 1e-3

usage = subprocess.run([sys.executable, str(path)], capture_output=True, text=True)
assert usage.returncode == 2 and json.loads(usage.stdout.strip())['ok'] is False
bad_skew = subprocess.run([sys.executable, str(path), '/nonexistent.wav', '0'], capture_output=True, text=True)
assert bad_skew.returncode == 2 and 'max_skew' in json.loads(bad_skew.stdout.strip())['error']
print('business-shazam-helper-unit: PASS')
