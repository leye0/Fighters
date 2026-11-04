# Fighters forest assets — CC0

The two bundled 3D tree models were created by **Quaternius** and published on
Poly Pizza under **CC0 1.0 Universal** (public domain dedication). They can be
used, modified and distributed in commercial projects without required credit.
We voluntarily keep these source links and author information.

| Bundled file | Source model | Original Poly Pizza page | Original GLB |
|---|---|---|---|
| `twisted.glb` | Twisted Tree (TwistedTree_4) | https://poly.pizza/m/7PDBpElkQr | `229336e6-4632-4bc7-af2e-ec1f3c8245f7.glb` |
| `dead.glb` | Dead Tree (DeadTree_2) | https://poly.pizza/m/Mcd2zYqyww | `d12c21bd-a5d1-41c9-b370-28e3708e61cc.glb` |

License: https://creativecommons.org/publicdomain/zero/1.0/

Both GLBs keep their original mesh, materials, UVs and shape but have their embedded 1024px PNG textures reduced to
256px WebP with `scripts/optimize-forest-glb.mjs`. No generated or handmade tree
geometry was substituted. Their on-disk sizes are 549 KiB and 253 KiB instead
of 3.0 MiB and 2.5 MiB; the total is about 800 KiB.

The renderer shares each GLB's geometry and materials across every instance,
using Three.js `InstancedMesh` (no per-tree model downloads).
