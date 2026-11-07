#!/usr/bin/env python3
"""Mix three real, CC0 Freesound recordings into one cinematic fire storm.

No synthetic key-clicks: falling whooshes, staggered fiery impacts and a
continuous bed of roaring flame. The three previews are Creative Commons Zero.
Requires ffmpeg and numpy. Run: python3 scripts/build-orc-fire-rain.py
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'app/sounds/effects/fire-rain/meteor-storm.mp3'
SOURCE = {
    'whoosh': 'https://cdn.freesound.org/previews/267/267887_5025429-hq.mp3',
    'impact': 'https://cdn.freesound.org/previews/431/431174_6512859-hq.mp3',
    'roar': 'https://cdn.freesound.org/previews/186/186932_545448-hq.mp3',
}
RATE = 44100
DURATION = 5.55


def decode(path: Path) -> np.ndarray:
    raw = subprocess.check_output([
        'ffmpeg', '-nostdin', '-loglevel', 'error', '-i', str(path), '-f', 'f32le',
        '-ar', str(RATE), '-ac', '2', 'pipe:1',
    ])
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def add_clip(out: np.ndarray, clip: np.ndarray, onset: float, gain: float,
             speed: float = 1.0, pan: float = 0.0) -> None:
    length = int(len(clip) / speed)
    sample_positions = np.arange(length) * speed
    indexes = np.minimum(sample_positions.astype(np.int64), len(clip) - 2)
    weight = (sample_positions - indexes).astype(np.float32)[:, None]
    changed = clip[indexes] * (1 - weight) + clip[indexes + 1] * weight
    start = max(0, round(onset * RATE))
    n = min(len(changed), len(out) - start)
    if n <= 0:
        return
    # Ten-millisecond edge fades prevent clicks between the different takes.
    edge = min(n // 2, round(.012 * RATE))
    if edge:
        changed[:edge] *= np.linspace(0, 1, edge, dtype=np.float32)[:, None]
        changed[n - edge:n] *= np.linspace(1, 0, edge, dtype=np.float32)[:, None]
    out[start:start + n, 0] += changed[:n, 0] * gain * (1 - .25 * pan)
    out[start:start + n, 1] += changed[:n, 1] * gain * (1 + .25 * pan)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix='fighters-fire-rain-') as temp:
        clips = {}
        for name, url in SOURCE.items():
            source_path = Path(temp) / f'{name}.mp3'
            urlretrieve(url, source_path)
            clips[name] = decode(source_path)

        out = np.zeros((round(DURATION * RATE), 2), dtype=np.float32)
        # The fire never stops between meteor hits. Layer the same real roar
        # with a soft crossfade to extend the field recording naturally.
        add_clip(out, clips['roar'], .00, .42)
        add_clip(out, clips['roar'], 2.85, .39, speed=.98, pan=-.24)
        add_clip(out, clips['roar'], 4.3, .20, speed=1.04, pan=.20)
        for index, onset in enumerate((.15, .65, 1.14, 1.70, 2.28, 2.89, 3.49)):
            pan = (-.7, .5, -.25, .82, -.55, .35, -.1)[index]
            add_clip(out, clips['whoosh'], onset, .34,
                     speed=(.90, 1.08, 1.0)[index % 3], pan=pan)
            add_clip(out, clips['impact'], onset + .57, .35,
                     speed=(.94, 1.04, 1.0)[index % 3], pan=pan)

        # A smooth rising attack and fading tail preserve the huge, airy mass
        # without clipping or a wall of distorted low-frequency noise.
        fade_in = min(len(out), round(.18 * RATE))
        fade_out = min(len(out), round(1.1 * RATE))
        out[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
        out[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
        peak = max(1e-6, float(np.max(np.abs(out))))
        out *= min(.92 / peak, 1.0)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            'ffmpeg', '-y', '-nostdin', '-loglevel', 'error', '-f', 'f32le',
            '-ar', str(RATE), '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame',
            '-q:a', '3', str(OUTPUT),
        ], input=out.astype(np.float32).tobytes(), check=True)
    print(f'Generated {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
