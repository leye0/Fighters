#!/usr/bin/env python3
"""Master the four EXISTING 'For the Wiccans!' shouts as a fully wet chorus.

Requires ffmpeg, numpy, scipy. No synthesis or external voice generation.
Rerun from anywhere: python scripts/build-witch-dome-chorus.py
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt


ROOT = Path(__file__).resolve().parents[1]
VOICE_ROOT = ROOT / "app/sounds/witches"
OUTPUT = ROOT / "app/sounds/effects/dome/wiccans-chorus.mp3"
RATE = 44100
ROLES = ("worker", "guard", "arcane", "elder")


def decode(path: Path) -> np.ndarray:
    data = subprocess.check_output([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "pipe:1"
    ])
    return np.frombuffer(data, dtype="<f4").astype(np.float64)


def impulse(seed: int, side: int) -> np.ndarray:
    """Cathedral-size stereo impulse, with SILENCE at t=0 (100% wet)."""
    rng = np.random.default_rng(seed + side * 199)
    duration = 5.45
    n = round(duration * RATE)
    time = np.arange(n) / RATE
    ir = np.zeros(n, dtype=np.float64)
    # The first reflections arrive about 140 ms after the incantation.
    # Long, asynchronous delays make the four voices sound like a coven.
    for delay, weight in [(0.14, .29), (.27, .39), (.49, .34),
                          (.72, .28), (1.03, .23), (1.49, .18),
                          (2.1, .12), (2.86, .08)]:
        ir[round((delay + side * .017) * RATE)] += weight
    noise = rng.standard_normal(n)
    noise = sosfilt(butter(2, 4800, fs=RATE, output="sos"), noise)
    # Diffuse tail emerges only after 190 ms; noise decreases exponentially.
    tail = np.maximum(0.0, time - .19)
    envelope = (time >= .19) * (1 - np.exp(-tail * 14)) * np.exp(-tail / 1.30)
    ir += noise * envelope * .012
    return ir


def main() -> None:
    catalog = json.loads((VOICE_ROOT / "manifest.json").read_text())
    shouts = {}
    for role in ROLES:
        matches = [entry for entry in catalog["sounds"]
                   if entry["category"] == "attack" and entry["voice"] == role
                   and entry["text"].strip().casefold() == "for the wiccans!"]
        if len(matches) != 1:
            raise ValueError(f"Expected precisely one recorded Wiccans cry for {role}")
        shouts[role] = decode(VOICE_ROOT / matches[0]["path"])

    # Four slightly staggered voices, distinct identities, one strong attack.
    offsets = (.00, .11, .24, .37)
    n = max(round(offset * RATE) + len(shouts[role])
            for offset, role in zip(offsets, ROLES))
    chorus = np.zeros(n, dtype=np.float64)
    for role, offset in zip(ROLES, offsets):
        voice = shouts[role]
        rms = np.sqrt(np.mean(voice * voice))
        level = min(.16 / max(rms, 1e-5), 2.0)
        start = round(offset * RATE)
        chorus[start:start + len(voice)] += voice * level

    # Convolution only: no feedthrough to the output, so dry gain is exactly 0.
    left = fftconvolve(chorus, impulse(783, 0), mode="full")
    right = fftconvolve(chorus, impulse(783, 1), mode="full")
    wet = np.stack((left, right), axis=1)
    # Keep the long tail airy without sharp high-frequency hiss.
    wet = sosfilt(butter(2, 6500, fs=RATE, output="sos"), wet, axis=0)
    fade = min(round(.95 * RATE), len(wet))
    wet[-fade:] *= np.linspace(1.0, 0.0, fade)[:, None]
    peak = float(np.max(np.abs(wet)))
    if peak < .001:
        raise ValueError("The reverberant master unexpectedly contains no sound")
    wet = np.tanh(wet / peak * 1.45) * .85 / np.tanh(1.45)
    # Float32 stereo PCM through stdin; encode a self-contained browser MP3.
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "pipe:0",
        "-c:a", "libmp3lame", "-b:a", "192k", str(OUTPUT)
    ], input=wet.astype("<f4").tobytes(), check=True)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(wet) / RATE:.2f}s, four voices, fully wet")


if __name__ == "__main__":
    main()
