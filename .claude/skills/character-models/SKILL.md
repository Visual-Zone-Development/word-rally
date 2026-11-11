---
name: character-models
description: Bring a high-quality 3D character into a --vite three.js game from a model file instead of building it in code — sourcing (VRoid Studio for anime characters, Blender, CC0 packs, the user's own files), budgets for the Deck, loading GLB and VRM (@pixiv/three-vrm with spring-bone hair and cloth), animation clips, the anime / storybook toon look (stepped shading with coloured shadows, rim light, outlines that follow skinning) and a character creator (swappable parts, recolours, saved choices). Use for "I want a character that looks like <anime / JRPG screenshot>", "add a proper hero model", "character creator", "use my VRoid / Blender model", "make the 3D look cel-shaded". For crowds and simple stylised units built in code use threejs-models.
---

# Character models from files

Follow AGENTS.md and `docs/game-design/3d.md` (render size, HUD canvas, models in `public/assets/models/`,
loading screen). Workflow and rounds are from **model-asset** (reference, breakdown, render-and-compare);
the whole-screen look is **art-direction**. This skill covers the part code-built models can't reach: a
hand-modelled, rigged, textured hero character, made to look anime / storybook in three.js.

**Be honest with the user about where quality comes from.** A character like a JRPG or anime hero is
modelled, textured and rigged in a tool; code can't sculpt that. What you can do in code is everything
*around* it: shading, outlines, lighting, animation blending, customisation and the scene. So step 1 is
always getting a good model file.

## 1. Get the model (the user supplies it)

You can't download from these sites yourself; guide the user, then they put the file in
`public/assets/models/`. Record the source and licence in `assets/CREDITS.md`.

| Source | Best for | Notes |
|---|---|---|
| **VRoid Studio** (free, Windows/Mac) | anime characters, character creators | Sliders for face, body, hair, clothes. Export **VRM** (best: comes with toon shading and hair/cloth physics) with *Reduce polygons*, *Texture atlas 1024* and *Reduce bones* on. VRoid's terms let users use characters they make, including commercially; check the current terms for the preset assets they used. |
| **Blender** (the user's own or a commissioned model) | any style, full control | Export **GLB**: apply transforms, +Y up, one armature, materials named by part (`Skin`, `Hair`, `Cape`), swappable parts as separate meshes named `Slot_Variant`. |
| **CC0 packs** (Quaternius, Kenney, KayKit) | quick stylised characters with animations | CC0 or similar: free to ship. Restyle with `toon.js`. |
| **Mixamo** (free with an Adobe account) | animations (walk, run, attack, idle) | Download FBX "without skin", convert to GLB in Blender, or retarget to VRM (see *Animation*). Usable in games under Adobe's terms; don't redistribute the raw files on their own. |
| **AI image-to-3D** | rough props, background characters | Needs cleanup, retopology and a rig to be usable; check the service's licence. Rarely good enough for a hero yet. |

**Budget (Deck / Legion Go):** hero ≤ ~15k triangles, others ≤ ~5k (`docs/game-design/assets.md`), textures
≤ 1024, ≤ 8 materials, ≤ ~60 bones. VRoid exports are often 30–70k triangles with 2048 textures: re-export
with reduction on, or decimate in Blender. Check file size (a hero GLB/VRM should stay under ~8 MB).

## 2. Load it

```sh
npm install @pixiv/three-vrm   # only for .vrm files
```

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'

const loader = new GLTFLoader()
loader.register((parser) => new VRMLoaderPlugin(parser))      // harmless for plain GLB

const gltf = await loader.loadAsync('assets/models/hero.vrm')   // or hero.glb
const vrm = gltf.userData.vrm                                   // undefined for a plain GLB
if (vrm) {
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(vrm)                                      // VRM 0.x faces −Z; turn it to face the camera
}
scene.add(gltf.scene)
// each frame, after your own animation: vrm?.update(dt)   → spring bones (hair, cape, skirt) and expressions
```

- Load behind a loading screen; the title and pause screens must never wait for the model (AGENTS.md: the
  check screenshots at ~3 s and presses Start soon after).
- Keep `renderer.setPixelRatio(Math.min(devicePixelRatio, 1))` at 1280×800 (3d.md); outlines and toon bands
  stay clean at that size.

## 3. The look (`toolkit/toon.js`)

Copy `toon.js` into `src/`. VRM files already use **MToon** (three-vrm's toon material, with its own outline
and shade colour): tune its values instead of replacing it, and only use `outline()` if the export has none.
For GLB from Blender or packs:

```js
import { toonify, outline, lights, recolor } from './toon.js'
lights(scene)                                          // warm key, cool sky fill, back light for the rim
toonify(model, {
  defaults: { shade: '#6a5a8a', rimAmount: 0.3 },      // cool violet shadows by default
  byName: { Skin: { shade: '#c0646a' }, Hair: { shade: '#5a6a9a' }, Cape: { shade: '#6a1a2a' } }
})
const hulls = outline(model, { width: 0.012 })         // ~1–1.5 % of the character's height, in model units
```

- **Coloured shadows** are the key to the painted / anime look: skin shades rosy, white cloth shades
  blue-violet, red cloth shades deep crimson. Never leave shadows grey.
- The rim light separates the character from a busy painted background; keep it subtle (0.2–0.4).
- Outlines follow skinning (the hull is pushed out along normals before skinning). Hard-edged normals split
  the outline into gaps: smooth the normals in Blender (or `geometry.computeVertexNormals()` on a merged copy).
  Put the outline width in STYLE.md and offer a Settings toggle if it costs frames.
- Faces: VRM expressions (`vrm.expressionManager.setValue('blink', v)`) for blinks and moods; for GLB, use
  morph targets or a painted eye texture you swap.
- Set the scene around it with **art-direction**: painted backdrop (a `wash()` canvas as `scene.background`
  via `CanvasTexture`, or on a plane behind the character), fog, and the grain overlay on the HUD canvas.

## 4. Animation

- GLB clips: `const mixer = new THREE.AnimationMixer(model)`; `mixer.clipAction(clip).play()`; cross-fade with
  `action.crossFadeTo(next, 0.15)`; `mixer.update(dt)` each frame. Match stride to real speed
  (`action.timeScale = speed / clipSpeed`) so feet don't slide (**animate-asset**).
- Mixamo onto VRM needs retargeting (bone names differ): follow three-vrm's *loadMixamoAnimation* example
  (it maps `mixamorig*` bones to VRM humanoid bones and fixes rest-pose rotations), and keep that script in
  the game's `src/`.
- Idle matters most on a character screen: a slow breathe, a blink every 2–5 s, hair and cape settling via
  spring bones (`vrm.update(dt)`), and a small turn toward the selected menu row.
- Freeze `mixer` and `vrm.update` while paused (AGENTS.md: the game is fully frozen when paused).

## 5. Character creator

- **Parts:** author variants on the same skeleton as meshes named `Slot_Variant` (`Hair_Windswept`,
  `Hair_Short`) and switch with `showVariant(model, 'Hair', 'Short')`. With VRoid, export one VRM per hairstyle
  only if they really differ; otherwise do it in Blender.
- **Colours:** `recolor(model, { Hair: '#e8e6ea' })` by material name; swatches drawn as circles on the HUD canvas.
- **UI:** a `menu.js` menu with `choice` value items (left/right changes the value) drawn in the game's style
  (art-direction's parchment card), the model in the left half turning slowly, prompts from `input.label()`.
- **Save** the choices in `save.data.hero` and call `save.save()` on Accept.

## 6. Verify

1. Render the character at play size and close up, in the game, next to the reference (model-asset's
   `shot.mjs` with `index.html` and keys to reach the screen).
2. Frame time on the Deck target with the character, outline and overlay on (**performance-pass**).
3. `npm run check`, bump `version`, Changelog line, credits in `assets/CREDITS.md`, commit and push.
