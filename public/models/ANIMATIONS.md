# Fighters — game-integrated Mixamo locomotion

Seven actual Mixamo YBot source FBX motions are acquired by the targeted GitHub
Action into temporary private scratch, validated against `assets/mixamo-available-clips.json`,
converted, retargeted to the bones of the actual Claudia, Carla and Realistic Man
GLBs, and then baked **inside those game character assets only**:

| In-game clip | Exact indexed FBX | Use |
| --- | --- | --- |
| `Fighters_Mixamo_Fighting_Idle` | `Fighting_Idle.fbx` | Fighting/idle stance; **one of the owner's kept 63** |
| `Fighters_Mixamo_Walk_Standard` | `Walking_21.fbx` | Standard enemy walk |
| `Fighters_Mixamo_Walk_Feminine` | `Walking_6.fbx` | Hero locomotion demo; not a final casting identity |
| `Fighters_Mixamo_Walk_Backward` | `Walking_Backwards.fbx` | Retreat while keeping facing |
| `Fighters_Mixamo_Left_Turn_180` | `Left_Turn_3.fbx` | Real authored 180° change of facing |
| `Fighters_Mixamo_Jump` | `Jump.fbx` | Authored jumping movement; **one of the owner's kept 63** |
| `Fighters_Mixamo_Fall` | `Falling_Idle.fbx` | Authored falling pose; **one of the owner's kept 63** |

The raw Mixamo FBX files, reusable YBot GLBs and animation-only packs are **not**
in this public Git repository. Their animation curves are integrated into the
playable human character GLBs, without raw YBot geometry. The animation source
is Adobe Mixamo, with the [Mixamo terms](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
applying separately from each character's CC BY attribution.

The binary and skeleton QA is a technical check, **not** certification that
foot contacts, turns, hips and transitions look natural on Léon's phone.
