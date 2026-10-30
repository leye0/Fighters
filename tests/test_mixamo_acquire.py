"""Offline unit tests for the rate-aware Mixamo research downloader."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch
from urllib.error import HTTPError

source = Path(__file__).resolve().parents[1] / "scripts" / "acquire-mixamo.py"
spec = importlib.util.spec_from_file_location("mixamo_acquire", source)
assert spec and spec.loader
acquire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acquire)


class RateLimitTest(TestCase):
    def test_retry_after_numeric_or_fallback(self) -> None:
        self.assertEqual(acquire.retry_after_seconds("95"), 95)
        self.assertEqual(acquire.retry_after_seconds("999999"), 3600)
        self.assertEqual(acquire.retry_after_seconds("garbage"), 180)
        self.assertEqual(acquire.retry_after_seconds(None), 180)

    def test_http_429_stops_batch_without_retry_storm(self) -> None:
        headers = {"Retry-After": "90"}
        exc = HTTPError("https://example.invalid/test", 429, "Too Many Requests", headers, None)
        pacer = acquire.RequestPacer(0.5)
        clip = {"filename": "Missing_Mixamo_Test.fbx", "sha256": None}
        folder = Path("/tmp/never-created-mixamo-test-fixture")
        with patch.object(acquire.Path, "is_file", return_value=False), patch.object(acquire, "urlopen", side_effect=exc) as fetch:
            with self.assertRaises(acquire.RateLimited):
                acquire.download_one(clip, folder, 5, pacer)
        self.assertEqual(fetch.call_count, 1)
        self.assertTrue(pacer.stopped.is_set())
        self.assertEqual(pacer.retry_after, 90)
        with self.assertRaises(acquire.RateLimited):
            pacer.before_request()


if __name__ == "__main__":
    main()
