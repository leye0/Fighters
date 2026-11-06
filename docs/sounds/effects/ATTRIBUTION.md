# Game sound effects

All bundled recordings in this folder are CC0 1.0 public-domain dedicated assets.
They are distributed as local files so the game never needs a third-party audio
API, tracker, or CDN while playing. No Replicate or paid audio generation is used.

| Game cue | Recording source | License |
| --- | --- | --- |
| `hammer/1..4.ogg` | Kenney Impact Sounds, `impact_plank_medium_000..003` | CC0 1.0 |
| `mine/1..4.ogg` | Kenney Impact Sounds, `impact_mining_000..003` | CC0 1.0 |
| `sword/hit-1..4.ogg` | Kenney Impact Sounds, `impact_metal_medium_000..003` | CC0 1.0 |
| `sword/swing-1..2.ogg` | Kenney RPG Audio, `knife_slice` variants | CC0 1.0 |
| `garden/1..4.ogg` | Kenney Impact Sounds, `footstep_grass_000..003` (foliage rustle) | CC0 1.0 |
| `raven/wings.wav` | *short pigeon wing flap* by zouzmusic, Freesound #414671, processed in Griffin House of Rooks `natural063/wings-01.wav` | CC0 1.0 |
| `raven/flutter.wav` | Another excerpt of the same wing-flap recording, processed in Griffin House of Rooks `raven-fight761/flutter.wav` | CC0 1.0 |
| `raven/caw-*.wav` | *Crow Call* by qubodup / nigelcoop, Freesound #813114, three different filtered excerpts in Griffin House of Rooks | CC0 1.0 |

Kenney's original collections: https://kenney.nl/assets/impact-sounds and
https://kenney.nl/assets/rpg-audio. The CC0 Godot conversion files were
obtained from https://github.com/Boyquotes/kenney-impact-sounds-for-godot and
https://github.com/Boyquotes/kenney-rpg-audio-for-godot; both carry CC0 licenses.

The raven recordings were obtained from
https://github.com/jeromeleegriffin/Griffin-House-of-Rooks and retain that
project's [source documentation](https://github.com/jeromeleegriffin/Griffin-House-of-Rooks/blob/main/assets/audio/raven-fight761/SOURCES.txt).
The source describes the actual bird as a **corvid/crow**, not a species-verified
common raven. The three calls are different treatments of **one recording**,
not falsely described as three separate field recordings. A handful of gentle
playback-rate variations add a fourth audible inflection.

Magic launches are original, procedurally generated airy sounds in
`rts-effects.js`; they contain no borrowed recording and are cached as four
short stereo AudioBuffers, once per AudioContext.
