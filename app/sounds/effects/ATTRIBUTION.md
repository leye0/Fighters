# Game sound effects

All bundled recordings in this folder are CC0 1.0 public-domain dedicated assets.
They are distributed as local files so the game never needs a third-party audio
API, tracker, or CDN while playing. No Replicate or paid audio generation is used.

| Game cue | Recording source | License |
| --- | --- | --- |
| `hammer/1..4.ogg` | [Anvil Hit 1](https://freesound.org/people/michorvath/sounds/270589/) by michorvath: **real** hammer striking an iron anvil; four subtle timbral/pitch variations of this authentic recording (the former synthetic-sounding Blacksmith's Hammer takes were removed from variants 2 and 4) | CC0 1.0 |
| `mine/1..4.ogg` | [Pickaxe #1](https://freesound.org/people/abstraktgeneriert/sounds/233633/) and [Pickaxe #3](https://freesound.org/people/abstraktgeneriert/sounds/233629/) by abstraktgeneriert, layered with real rock impacts [stonehit1](https://freesound.org/people/aerror/sounds/350750/) and [stonehit3](https://freesound.org/people/aerror/sounds/350748/) recorded by aerror | CC0 1.0 |
| `sword/hit-1.ogg` | [Sword sound 1](https://freesound.org/people/Merrick079/sounds/568170/) by Merrick079: sword striking armour | CC0 1.0 |
| `sword/hit-2.ogg` | [Sword Hit](https://freesound.org/people/qubodup/sounds/442769/) by qubodup: layered metal sword impact | CC0 1.0 |
| `sword/hit-3.ogg` | [sword-01](https://freesound.org/people/audione/sounds/52458/) by audione: sword blade | CC0 1.0 |
| `sword/hit-4.ogg` | [Sword](https://freesound.org/people/cribbler/sounds/381864/) by cribbler: sword effect | CC0 1.0 |
| `sword/swing-1.ogg` | [Swing Woosh](https://freesound.org/people/Jofae/sounds/389590/) by Jofae: actual bullwhip moving through the air | CC0 1.0 |
| `sword/swing-2.ogg` | [Basic Melee Swing / Miss / Whoosh](https://freesound.org/people/SypherZent/sounds/420668/) by SypherZent | CC0 1.0 |
| `garden/1..4.ogg` | Kenney Impact Sounds, `footstep_grass_000..003` (foliage rustle) | CC0 1.0 |
| `raven/wings.wav` | *short pigeon wing flap* by zouzmusic, Freesound #414671, processed in Griffin House of Rooks `natural063/wings-01.wav` | CC0 1.0 |
| `raven/flutter.wav` | Another excerpt of the same wing-flap recording, processed in Griffin House of Rooks `raven-fight761/flutter.wav` | CC0 1.0 |
| `raven/caw-*.wav` | *Crow Call* by qubodup / nigelcoop, Freesound #813114, three different filtered excerpts in Griffin House of Rooks | CC0 1.0 |
| `fire-rain/meteor-storm.mp3` | Layered **real recordings**: [Short-Fireball-Woosh](https://freesound.org/people/wjl/sounds/267887/) by wjl (recorded stove flame/computer fans), [Fireball Explosion](https://freesound.org/people/Blankened/sounds/431174/) by Blankened, and [fire_explosion](https://freesound.org/people/ReadeOnly/sounds/186932/) by ReadeOnly. Seven staggered descending whooshes and impacts are mixed over an uninterrupted, roaring fire bed. The reproducible mix is in `scripts/build-orc-fire-rain.py`. | CC0 1.0 |

The remaining Kenney grass recordings originate from
https://kenney.nl/assets/impact-sounds and the CC0 Godot conversion at
https://github.com/Boyquotes/kenney-impact-sounds-for-godot.
The metal/rock originals come from the public source archive
https://github.com/Wh1teDuke/WilhelmSFX; their individual Freesound pages above
confirm CC0. Recordings
were level-adjusted and converted to Ogg Vorbis for gameplay. Matching MP3s
in `sounds/previews/` serve as mobile playback fallbacks. The mine variants
combine a quieter metallic tip with naturally recorded stone fragments;
neither sound is a wooden knock or a synthetic replacement for the rock impact.

The raven recordings were obtained from
https://github.com/jeromeleegriffin/Griffin-House-of-Rooks and retain that
project's [source documentation](https://github.com/jeromeleegriffin/Griffin-House-of-Rooks/blob/main/assets/audio/raven-fight761/SOURCES.txt).
The source describes the actual bird as a **corvid/crow**, not a species-verified
common raven. The three calls are different treatments of **one recording**,
not falsely described as three separate field recordings. A handful of gentle
playback-rate variations add a fourth audible inflection.

The two wing-flap recordings were re-rendered with a gentle 3.8-3.9 kHz
low-pass, softer fade-in and fade-out, and 38% lower recorded amplitude to
remove the harsh attack. The in-game wing gain is reduced separately, while
the crow calls remain unchanged.

Magic launches are original, procedurally generated airy sounds in
`rts-effects.js`; they contain no borrowed recording and are cached as four
short stereo AudioBuffers, once per AudioContext.
