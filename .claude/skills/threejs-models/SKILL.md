---
name: threejs-models
description: Build 3D characters, creatures, vehicles, machines and props in code with three.js (no modelling tool) for a --vite game — sculpted parts (lofted bodies, extruded plates, horns, armour shells, fur), hand-painted canvas textures, a small skeleton with blended procedural animation, instanced rendering for many copies, and an asset viewer for renders. Load it together with model-asset (workflow), edit-asset or animate-asset whenever a three.js game's models are made in code.
---

# three.js models in code

The general workflow (reference, breakdown, rounds, STYLE.md) is in **model-asset**, **edit-asset** and
**animate-asset**. This skill is the three.js how-to: a toolkit for building models from code.

## Toolkit

In `toolkit/` next to this file. Copy what the game needs into its `src/` (into a `--vite` game with
`npm install three`); if the game already has copies, use and extend those.

| File | Gives you |
|---|---|
| `sculpt.js` | Geometry: `loft()` (elliptical cross-sections → bodies, limbs, heads, hulls, bottles…), `plate()` (extruded 2D outline → blades, wings, fins, signs, emblems), `hornGeo()` (bent tapered tube → horns, tusks, tails, cables), `shell()` + `shellRim()` (rounded-rectangle dome → armour, canopies, roofs), `furRoll()` (clumpy torus → fur, foliage rings). Painting: `canvas()`, `grad()`, `blob()`, seeded `rnd()`. Shared `common.*` materials (leather, metal, steel, plate, fur, cloth strips, hair, blade). `registerShapes()` / `registerMaterials()` registry, `texturedMaterial()`. |
| `rig.js` | `createArmy(scene)`: draws every part of every instance through a few `InstancedMesh`es (one per shape × material), so hundreds of copies cost tens of draw calls. A small skeleton with blended procedural animation (see *Rig*), team colour (`color: 'team'`), `painted()` top-light shading. |
| `assets.js` | `ASSETS = { '<group>.<id>': definition }` for the viewer. |
| `viewer.html`, `viewer.js` | Asset viewer: `?unit=<id>&views=front,34,side,back,top,game&anim=<a>&frames=<n>&compare=<id2>&team=&zoom=&t=`, `?list`. Sets `document.title = 'ready'` for model-asset's `scripts/shot.mjs`. Not part of the game build. |
| `models/orc-grunt.js` | A worked example: one file per asset, with its shapes, painted textures and part list. |

## Building a model

- A model definition is `{ rig, …rig numbers, parts: [{ bone, shape, mat, pos, rot, size, color }] }`. Parts are
  rigid pieces attached to bones; `size` scales the unit shape; `color: 'team'` takes the owner's colour.
- **One file per asset** in `src/models/`, registering its shapes and materials under its own prefix
  (`'hero.torso'`); shared pieces live in `sculpt.js` as `common.*`.
- `loft()` sections are `[y, rx, rz, dz, dx, flat]` bottom to top; UVs run u = 0 at the back, 0.5 at the front, v
  bottom → top (canvas y = 0 is the top), so painted textures put the face/chest in the middle.
- Hide joints with overlap (spheres at elbows, cuffs, shoulder armour). Thin trims (rims, tubes) get a plain
  material: tube UVs stretch a banded texture.
- Exaggerate for the game's camera (see the game's STYLE.md).

## Rig

`rig.js` ships three rig types; add others the same way (a new `pose()` branch with its bones) when a game needs
them (flyers, serpents, vehicles with suspension, robots).

| Rig | Bones |
|---|---|
| `biped` | `root → body → chest → head`; arms `arm → fore → hand` (L/R); legs `leg → shin` (L/R); cloth `skirtF`, `skirtB`, `cape` |
| `quad` | `body`, `head`, `legFL/FR/BL/BR`, `tail`, `saddle` + rider bones `rChest`, `rHead`, `rArmL/R`, `rHandR`, `rLegL/R`, `cape` |
| `engine` | `body`, `arm` (thrower) or a ram thrust (`ram: true`) |

Animation: set `u.anim` to `idle`, `walk`, `run`, `attack`, `cast` or `die`; `army.hit(u)` plays a recoil. Weights
blend over ~0.1 s, the stride advances with movement, curves are eased keyframes (`keys()` with `inOut`, `out`,
`in`, `back`), and every instance has a seed so crowds desync. Timing tokens on the definition: `stride`,
`attackTime`, `heavy` (0..1), posture `lean`, `splay`, `stance`, `legSplay`, `neckZ`, `aim` (ranged pose).
Movement itself belongs to the game: it sets `u.x`, `u.z`, `u.heading` from its own physics each frame, and the rig
animates in place; set `u.speed` so the stride matches the real velocity (animate-asset: no foot sliding).

The rig suits crowds of units seen from above (strategy, tactics, arena games). A game with one hero up close, a
vehicle or physics-driven ragdolls may use only `sculpt.js` and its own posing, or a model file instead.

## Rendering for comparison

```sh
node .claude/skills/model-asset/scripts/shot.mjs <game-id> <scratch> \
  "viewer.html?unit=<id>&views=front,34,side,game|views.png" \
  "viewer.html?unit=<id>&anim=walk&frames=8&views=side,front|walk.png" \
  "viewer.html?unit=<id>&compare=<id>Old&views=front,34|compare.png"
```

The `game` view uses a high RTS-style camera; change `camFor()` in `viewer.js` to match the game's camera.

## Budget (handhelds)

- Each new shape × material pair is one draw call shared by all instances: reuse shapes (scale them per part)
  and `common.*` materials; keep a model to ≤ ~8 materials and ≤ ~4k triangles.
- Painted textures 64–256 px. One shadow-casting light. No allocations in `pose()`.
- See `docs/game-design/3d.md` for renderer settings and the frame budget.
