#!/usr/bin/env python3
"""Проверки без GPU: манифест, SHA256, разбор голоса, таблица сравнения."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

KIT = Path(__file__).resolve().parent
sys.path.insert(0, str(KIT))

import compare  # noqa: E402
import manifest  # noqa: E402
import metrics  # noqa: E402


def write_wav(path: Path, frames: int = 160) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(16000)
        handle.writeframes(b"\x00\x00" * frames)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ManifestTests(unittest.TestCase):
    def test_shipped_manifest_is_the_five_tracks(self) -> None:
        document = json.loads((KIT / "tracks.json").read_text(encoding="utf-8"))
        rows = document["tracks"]
        self.assertEqual(
            [row["filename"] for row in rows],
            [
                "tihaya-garmoniya.mp3",
                "last-plastinka.wav",
                "solnechnoe-utro-v-rime.mp3",
                "kolybelnaya-vocal.mp3",
                "klyuch-k-izobiliyu.mp3",
            ],
        )
        self.assertEqual(
            [row["label"] for row in rows],
            ["instrumental", "instrumental", "instrumental", "vocal", "speech"],
        )
        self.assertEqual(rows[2]["instruments"], ["piano", "guitar"])
        for row in rows:
            allowed = {"filename", "sha256", "label", "instruments"}
            self.assertTrue(set(row).issubset(allowed))
            self.assertNotIn("title", row)
            self.assertNotIn("path", row)
        known = {item["filename"]: item["sha256"] for item in manifest.KNOWN_TRACKS}
        self.assertEqual(known.keys(), {row["filename"] for row in rows})
        for row in rows:
            self.assertEqual(row["sha256"], known[row["filename"]])

    def test_known_hash_rejects_a_different_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            target = folder / "tihaya-garmoniya.mp3"
            target.write_bytes(b"not-the-track")
            manifest_path = folder / "tracks.json"
            manifest_path.write_text(
                json.dumps({"tracks": [{"filename": "tihaya-garmoniya.mp3", "label": "instrumental"}]}),
                encoding="utf-8",
            )
            with self.assertRaises(manifest.ManifestError) as caught:
                manifest.resolve_tracks(manifest_path, folder)
            self.assertIn("adda7e87", str(caught.exception))

    def test_manifest_sha_cannot_override_a_known_track(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            manifest_path = folder / "tracks.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "tracks": [
                            {
                                "filename": "last-plastinka.wav",
                                "sha256": "a" * 64,
                                "label": "instrumental",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaises(manifest.ManifestError) as caught:
                manifest.resolve_tracks(manifest_path, folder)
            self.assertIn("793773fe", str(caught.exception))

    def test_same_folder_and_optional_sha(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            first = folder / "one.wav"
            second = folder / "two.wav"
            write_wav(first, 80)
            write_wav(second, 120)
            rows = [
                {"filename": "one.wav", "sha256": sha256(first), "label": "instrumental", "instruments": ["piano"]},
                {"filename": "two.wav", "label": "speech"},
            ]
            manifest_path = folder / "local.json"
            manifest_path.write_text(json.dumps({"tracks": rows}), encoding="utf-8")
            tracks = manifest.resolve_tracks(manifest_path, None)
            self.assertEqual(len(tracks), 2)
            self.assertEqual(tracks[0].path, first.resolve())
            self.assertEqual(tracks[0].instruments, ["piano"])
            self.assertIsNone(tracks[1].sha256_expected)
            self.assertEqual(tracks[1].label, "speech")

    def test_csv_roundtrip_of_shipped_names(self) -> None:
        rows = manifest.load_rows(KIT / "tracks.csv")
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[3]["label"], "vocal")
        self.assertEqual(rows[4]["label"], "speech")
        self.assertIn("piano", rows[2]["instruments"])


class MetricTests(unittest.TestCase):
    def test_voice_parser_and_screen_threshold(self) -> None:
        parsed = metrics.parse_moss_voice("instrumental\nconfidence: 0.82\nNo singing.")
        self.assertEqual(parsed["label"], "instrumental")
        self.assertAlmostEqual(parsed["confidence"], 0.82)
        self.assertEqual(metrics.parse_moss_voice("vocal\nconfidence: 0.7")["label"], "vocal")
        self.assertEqual(metrics.parse_moss_voice("speech\nconfidence: 0.4")["label"], "speech")
        self.assertEqual(metrics.parse_moss_voice("No, there is no singing or speech.")["label"], "instrumental")
        screen = metrics.screen_from_scores(
            {"instrumental": 0.058268, "vocal": 0.077916, "mixed": 0.079067, "spoken_word": 0.021839},
            0.964906,
        )
        self.assertEqual(screen, "abstain")

    def test_per_label_and_instruments(self) -> None:
        summary = metrics.summarize(
            [
                {"truth": "instrumental", "moss": "instrumental", "analyzer_raw": "mixed", "analyzer_screen": "abstain"},
                {"truth": "vocal", "moss": "vocal", "analyzer_raw": "unavailable", "analyzer_screen": "unavailable"},
                {"truth": "speech", "moss": "speech", "analyzer_raw": "unavailable", "analyzer_screen": "unavailable"},
            ]
        )
        self.assertEqual(summary["exact"]["moss"]["instrumental"]["correct"], 1)
        self.assertEqual(summary["exact"]["moss"]["vocal"]["correct"], 1)
        self.assertEqual(summary["exact"]["moss"]["speech"]["correct"], 1)
        self.assertEqual(summary["exact"]["analyzer_raw"]["instrumental"]["wrong"], 1)
        self.assertEqual(summary["overall_binary"]["analyzer_raw"]["wrong"], 1)
        instruments = metrics.summarize_instruments(
            [
                {
                    "title": "Солнечное утро в Риме",
                    "instruments": ["piano", "guitar"],
                    "moss_instruments": "I hear a piano and a nylon guitar.",
                    "analyzer_instruments": ["strings", "flute"],
                }
            ]
        )
        self.assertEqual(instruments["moss_hit"], 2)
        self.assertEqual(instruments["analyzer_hit"], 0)
        self.assertEqual(instruments["analyzer_total"], 2)


class RunTests(unittest.TestCase):
    def test_dry_run_and_cpu_smoke_do_not_load_the_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            audio = folder / "clip.wav"
            write_wav(audio, 200)
            manifest_path = folder / "m.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "tracks": [
                            {
                                "filename": "clip.wav",
                                "sha256": sha256(audio),
                                "label": "instrumental",
                                "instruments": ["piano", "guitar"],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            out = folder / "out"
            completed = subprocess.run(
                [sys.executable, str(KIT / "run.py"), "--manifest", str(manifest_path), "--out-dir", str(out), "--dry-run"],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            document = json.loads((out / "results.json").read_text(encoding="utf-8"))
            self.assertEqual(document["mode"], "dry-run")
            self.assertEqual(document["model"]["load_count"], 0)
            self.assertEqual(document["tracks"][0]["voice"]["label"], "abstain")
            comparison = (out / "comparison.md").read_text(encoding="utf-8")
            self.assertIn("Голос: точность по меткам", comparison)
            self.assertIn("piano", comparison)

            smoke = subprocess.run(
                [
                    sys.executable,
                    str(KIT / "run.py"),
                    "--manifest",
                    str(manifest_path),
                    "--out-dir",
                    str(folder / "smoke"),
                    "--cpu-smoke",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(smoke.returncode, 0, smoke.stderr)
            smoked = json.loads((folder / "smoke" / "results.json").read_text(encoding="utf-8"))
            self.assertEqual(smoked["mode"], "cpu-smoke")
            self.assertAlmostEqual(smoked["tracks"][0]["duration_s"], 200 / 16000, places=5)
            self.assertEqual(smoked["model"]["load_count"], 0)

    def test_known_hashes_join_saved_analyzer_snapshots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            document = {
                "schema": "moss-music-experiment-1cd25ba6",
                "mode": "dry-run",
                "model": {"load_count": 0},
                "timings": {},
                "gpu": None,
                "tracks": [
                    {
                        "filename": "tihaya-garmoniya.mp3",
                        "title": "Тихая гармония",
                        "sha256": "adda7e8735f90686ed52516cd979b875ba7f955d15aee8faf412d018e20c291c",
                        "label": "instrumental",
                        "instruments": [],
                        "prompts": [],
                        "voice": {"label": "abstain", "confidence": None},
                    },
                    {
                        "filename": "last-plastinka.wav",
                        "title": "Последняя пластинка",
                        "sha256": "793773feae95b724bce3c38d8f2c49a580c7e879a684d2349a6316acdb7759fa",
                        "label": "instrumental",
                        "instruments": [],
                        "prompts": [{"id": "instruments", "answer": "piano and guitar"}],
                        "voice": {"label": "instrumental", "confidence": 0.9},
                    },
                ],
            }
            path = folder / "results.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            compare.write_comparison(path, folder / "comparison.md")
            text = (folder / "comparison.md").read_text(encoding="utf-8")
            self.assertIn("mixed (голос/смешение)", text)
            self.assertIn("После порогов", text)
            self.assertIn("Dark Jazz", text)

    def test_shipped_manifest_without_audio_stops(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            completed = subprocess.run(
                [
                    sys.executable,
                    str(KIT / "run.py"),
                    "--manifest",
                    str(KIT / "tracks.json"),
                    "--input-dir",
                    tmp,
                    "--dry-run",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 2)
            self.assertIn("tihaya-garmoniya.mp3", completed.stderr)


if __name__ == "__main__":
    unittest.main()
